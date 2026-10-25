import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { chromium, type BrowserContext, type Page } from '@playwright/test';

const ROUNDS = 3;
const WINDOW_MS = 10_000;
const TEST_PAGE = 'http://localhost:4321';
const extensionPath = join(import.meta.dirname, '..', '.output', 'chrome-mv3-e2e');

interface Scenario {
  name: string;
  open: (page: Page, withExtension: boolean) => Promise<void>;
}

const scenarios: Scenario[] = [
  {
    name: 'página sem vídeo',
    open: async (page) => {
      await page.route(`${TEST_PAGE}/no-video.html`, (route) =>
        route.fulfill({
          contentType: 'text/html',
          body: '<!doctype html><title>Text</title><h1>An article</h1><p>No video here.</p>',
        }),
      );
      await page.goto(`${TEST_PAGE}/no-video.html`);
    },
  },
  {
    name: 'página sem vídeo que muda a cada 100 ms',
    open: async (page) => {
      await page.route(`${TEST_PAGE}/live-score.html`, (route) =>
        route.fulfill({
          contentType: 'text/html',
          body: `<!doctype html><title>Live</title><ul id="feed"></ul><script>
            setInterval(() => {
              const feed = document.getElementById('feed');
              const item = document.createElement('li');
              item.textContent = new Date().toISOString();
              feed.prepend(item);
              if (feed.children.length > 20) feed.lastElementChild.remove();
            }, 100);
          </script>`,
        }),
      );
      await page.goto(`${TEST_PAGE}/live-score.html`);
    },
  },
  {
    name: 'vídeo pausado com a legenda na tela',
    open: async (page, withExtension) => {
      await page.goto(`${TEST_PAGE}/native-tracks.html`);
      await page.evaluate(async () => {
        const video = document.querySelector('video');
        if (!video) throw new Error('No video on the page');
        const seeked = new Promise((resolve) => {
          video.addEventListener('seeked', resolve, { once: true });
        });
        video.currentTime = 0.75;
        await seeked;
      });
      if (withExtension) {
        await page
          .locator('projeto-bilingue-legenda .english')
          .getByText('Hello, this is the test page.')
          .waitFor();
      }
    },
  },
];

async function launch(withExtension: boolean): Promise<BrowserContext> {
  const args = withExtension
    ? [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`]
    : [];
  const context = await chromium.launchPersistentContext('', { channel: 'chromium', args });
  if (withExtension) await waitForSiteScript(context);
  return context;
}

async function waitForSiteScript(context: BrowserContext): Promise<void> {
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  await worker.evaluate(async () => {
    const { scripting } = (
      globalThis as unknown as {
        chrome: { scripting: { getRegisteredContentScripts: () => Promise<unknown[]> } };
      }
    ).chrome;
    while ((await scripting.getRegisteredContentScripts()).length === 0) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  });
}

async function busyMs(
  scenario: Scenario,
  withExtension: boolean,
): Promise<{ task: number; script: number }> {
  const context = await launch(withExtension);
  try {
    const page = await context.newPage();
    await scenario.open(page, withExtension);
    await page.waitForTimeout(2_000);
    const cdp = await context.newCDPSession(page);
    await cdp.send('Performance.enable');
    const read = async () => {
      const { metrics } = await cdp.send('Performance.getMetrics');
      const value = (name: string) => metrics.find((metric) => metric.name === name)?.value ?? 0;
      return { task: value('TaskDuration'), script: value('ScriptDuration') };
    };
    const before = await read();
    await page.waitForTimeout(WINDOW_MS);
    const after = await read();
    return {
      task: (after.task - before.task) * 1000,
      script: (after.script - before.script) * 1000,
    };
  } finally {
    await context.close();
  }
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

const server = spawn('npx', ['vite', 'e2e/test-page', '--port', '4321', '--strictPort'], {
  cwd: join(import.meta.dirname, '..'),
  stdio: 'ignore',
});
try {
  await new Promise((resolve) => setTimeout(resolve, 3_000));
  for (const scenario of scenarios) {
    for (const withExtension of [false, true]) {
      const rounds = [];
      for (let round = 0; round < ROUNDS; round += 1)
        rounds.push(await busyMs(scenario, withExtension));
      const task = median(rounds.map((measure) => measure.task)).toFixed(1);
      const script = median(rounds.map((measure) => measure.script)).toFixed(1);
      const label = withExtension ? 'com a extensão' : 'sem a extensão';
      process.stdout.write(
        `${scenario.name}, ${label}: ${task} ms de trabalho, ${script} ms de script em 10 s\n`,
      );
    }
  }
} finally {
  server.kill();
}
