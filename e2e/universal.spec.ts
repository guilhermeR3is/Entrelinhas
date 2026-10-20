import type { BrowserContext, Page } from '@playwright/test';
import { expect, test } from './fixtures';

const OVERLAY = 'projeto-bilingue-legenda';
const ENGLISH = `${OVERLAY} .english`;
const PORTUGUESE = `${OVERLAY} .portuguese`;

type RegisteredScript = { id: string; matches?: string[] };

async function registeredScripts(context: BrowserContext): Promise<RegisteredScript[]> {
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  return worker.evaluate(() =>
    (
      globalThis as unknown as {
        chrome: { scripting: { getRegisteredContentScripts: () => Promise<RegisteredScript[]> } };
      }
    ).chrome.scripting.getRegisteredContentScripts(),
  );
}

async function seek(page: Page, seconds: number): Promise<void> {
  await page.evaluate(async (time) => {
    const video = document.querySelector('video');
    if (!video) throw new Error('No video on the page');
    const seeked = new Promise((resolve) => {
      video.addEventListener('seeked', resolve, { once: true });
    });
    video.currentTime = time;
    await seeked;
  }, seconds);
}

async function sendToTestPage(context: BrowserContext, message: object): Promise<void> {
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  await worker.evaluate(async (sent) => {
    const tabs = (
      globalThis as unknown as {
        chrome: {
          tabs: {
            query: (filter: object) => Promise<{ id?: number }[]>;
            sendMessage: (tabId: number, message: unknown) => Promise<unknown>;
          };
        };
      }
    ).chrome.tabs;
    const [tab] = await tabs.query({ url: 'http://localhost/*' });
    if (tab?.id === undefined) throw new Error('Test page tab not found');
    await tabs.sendMessage(tab.id, sent);
  }, message);
}

test.beforeEach(async ({ context }) => {
  await expect
    .poll(async () =>
      (await registeredScripts(context)).map(({ id, matches }) => ({ id, matches })),
    )
    .toEqual([{ id: 'universal', matches: ['http://localhost/*'] }]);
});

test('registers the universal script only for the sites without their own adapter', async ({
  context,
}) => {
  const [script] = await registeredScripts(context);
  expect(script?.matches).not.toContain('https://www.youtube.com/*');
});

test('shows the native English track with the official Portuguese one over the video', async ({
  page,
}) => {
  await page.goto('/native-tracks.html');
  await expect(page.locator(OVERLAY)).toBeAttached();
  await seek(page, 0.75);
  await expect(page.locator(ENGLISH)).toHaveText('Hello, this is the test page.');
  await expect(page.locator(PORTUGUESE)).toHaveText('Olá, esta é a página de teste.');

  const modes = await page.evaluate(() =>
    Array.from(document.querySelector('video')?.textTracks ?? [], (track) => track.mode),
  );
  expect(modes).toEqual(['hidden', 'hidden']);
});

test('keeps the caption inside the video area', async ({ page }) => {
  await page.goto('/native-tracks.html');
  await seek(page, 0.75);
  await expect(page.locator(ENGLISH)).toBeVisible();

  const videoBox = await page.locator('video').boundingBox();
  const captionBox = await page.locator(`${OVERLAY} .subtitle`).boundingBox();
  if (!videoBox || !captionBox) throw new Error('Missing boxes');
  expect(captionBox.x).toBeGreaterThanOrEqual(videoBox.x);
  expect(captionBox.y).toBeGreaterThanOrEqual(videoBox.y);
  expect(captionBox.x + captionBox.width).toBeLessThanOrEqual(videoBox.x + videoBox.width);
  expect(captionBox.y + captionBox.height).toBeLessThanOrEqual(videoBox.y + videoBox.height);
});

test('lets clicks on the video reach the player, outside the caption box', async ({ page }) => {
  await page.goto('/native-tracks.html');
  await seek(page, 0.75);
  await expect(page.locator(ENGLISH)).toBeVisible();
  const reached = await page.evaluate(() => {
    const video = document.querySelector('video');
    const box = video?.getBoundingClientRect();
    if (!box) return null;
    return document.elementFromPoint(box.left + 20, box.top + 20)?.tagName.toLowerCase();
  });
  expect(reached).toBe('video');
});

test('Z slows the video down on any site', async ({ page }) => {
  await page.goto('/native-tracks.html');
  await expect(page.locator(OVERLAY)).toBeAttached();
  await page.locator('h1').click();
  await page.keyboard.press('z');
  await expect
    .poll(() => page.evaluate(() => document.querySelector('video')?.playbackRate))
    .toBe(0.95);
});

test('steps aside and gives the site its subtitles back when the person turns the site off', async ({
  context,
  page,
}) => {
  await page.goto('/native-tracks.html');
  await seek(page, 0.75);
  await expect(page.locator(ENGLISH)).toBeVisible();

  await sendToTestPage(context, { type: 'projeto-bilingue:site-deactivated' });

  await expect(page.locator(OVERLAY)).toHaveCount(0);
  const modes = await page.evaluate(() =>
    Array.from(document.querySelector('video')?.textTracks ?? [], (track) => track.mode),
  );
  expect(modes).toEqual(['showing', 'disabled']);
});

test.describe('on a site whose player draws its own captions', () => {
  test.beforeEach(async ({ context }) => {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    await worker.evaluate(() =>
      (
        globalThis as unknown as {
          chrome: { storage: { local: { set: (items: object) => Promise<void> } } };
        }
      ).chrome.storage.local.set({
        siteRules: { 'localhost:4321': { captionSelector: 'div.fp-captions span.fp-line' } },
      }),
    );
  });

  test('shows the line the player draws with its translation and hides the original', async ({
    page,
  }) => {
    await page.goto('/screen-captions.html?fake-translator=available');
    await expect(page.locator(OVERLAY)).toBeAttached();
    await seek(page, 1);
    await expect(page.locator(ENGLISH)).toHaveText('Hello, this is the test page.');
    await expect(page.locator(PORTUGUESE)).toHaveText('[pt] Hello, this is the test page.');
    await expect(page.locator('.fp-line')).toHaveCSS('visibility', 'hidden');

    await seek(page, 3);
    await expect(page.locator(ENGLISH)).toHaveText('Cues can touch end to end.');
    await expect(page.locator(PORTUGUESE)).toHaveText('[pt] Cues can touch end to end.');
  });

  test('clears the line in the gaps of the player', async ({ page }) => {
    await page.goto('/screen-captions.html');
    await expect(page.locator(OVERLAY)).toBeAttached();
    await seek(page, 1);
    await expect(page.locator(ENGLISH)).toBeVisible();
    await seek(page, 6);
    await expect(page.locator(`${OVERLAY} .subtitle`)).toBeHidden();
  });
});

test.describe('picking the caption on the screen', () => {
  const PICK = { type: 'projeto-bilingue:pick-caption' };
  const STRIP = `${OVERLAY} .picker-strip`;

  async function storedRules(context: BrowserContext): Promise<unknown> {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    return worker.evaluate(async () => {
      const local = (
        globalThis as unknown as {
          chrome: {
            storage: { local: { get: (key: string) => Promise<Record<string, unknown>> } };
          };
        }
      ).chrome.storage.local;
      return (await local.get('siteRules')).siteRules;
    });
  }

  test.beforeEach(async ({ page, context }) => {
    await page.goto('/screen-captions.html');
    await expect(page.locator(OVERLAY)).toBeAttached();
    await seek(page, 1);
    await sendToTestPage(context, PICK);
    await expect(page.locator(STRIP)).toContainText('Clique na legenda do vídeo. Esc cancela.');
  });

  test('outlines the text under the mouse, learns it on click and reads it from then on', async ({
    page,
    context,
  }) => {
    const line = page.locator('.fp-line');
    await line.hover();
    await expect(page.locator(`${OVERLAY} .picker-outline`)).toBeVisible();
    await line.click();

    await expect(page.locator(STRIP)).toContainText('aprendida');
    await expect(page.locator(ENGLISH)).toHaveText('Hello, this is the test page.');
    await expect(line).toHaveCSS('visibility', 'hidden');
    expect(await storedRules(context)).toEqual({
      'localhost:4321': { captionSelector: 'div.fp-captions span.fp-line' },
    });
    expect(await page.evaluate(() => document.querySelector('video')?.paused)).toBe(true);
  });

  test('asks again when the click lands on the video where there is no text', async ({ page }) => {
    const video = await page.locator('video').boundingBox();
    if (!video) throw new Error('Missing video box');
    await page.mouse.click(video.x + 40, video.y + 40);
    await expect(page.locator(STRIP)).toContainText('Esse elemento não tem texto.');
  });

  test('gives up with Esc and shows nothing learned', async ({ page, context }) => {
    await page.keyboard.press('Escape');
    await expect(page.locator(STRIP)).toHaveCount(0);
    expect(await storedRules(context)).toBeUndefined();
  });
});
