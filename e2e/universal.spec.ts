import { fileURLToPath } from 'node:url';
import type { BrowserContext, Frame, Page } from '@playwright/test';
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
    .toEqual([{ id: 'universal', matches: ['http://localhost/*', 'http://player.localhost/*'] }]);
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

test.describe('loading a subtitle file', () => {
  const LOAD = { type: 'projeto-bilingue:load-file' };
  const STRIP = `${OVERLAY} .file-strip`;
  const LESSON = fileURLToPath(new URL('./test-page/lesson.srt', import.meta.url));

  async function openLoader(page: Page, context: BrowserContext, url: string): Promise<void> {
    await page.goto(url);
    await expect(page.locator(OVERLAY)).toBeAttached();
    await sendToTestPage(context, LOAD);
    await expect(page.locator(STRIP)).toContainText('Solte aqui um arquivo .srt ou .vtt.');
  }

  async function chooseFile(page: Page, file: Parameters<Page['setInputFiles']>[1]) {
    const chooser = page.waitForEvent('filechooser');
    await page.locator(OVERLAY).getByRole('button', { name: 'Escolher arquivo' }).click();
    await (await chooser).setFiles(file);
  }

  test('reads the chosen file over the video and shifts it 100 ms per press', async ({
    page,
    context,
  }) => {
    await openLoader(page, context, '/plain-video.html');
    await chooseFile(page, LESSON);

    await expect(page.locator(STRIP)).toContainText(
      'Lendo lesson.srt. Ajuste o atraso na faixa de estudo.',
    );
    await seek(page, 0.75);
    await expect(page.locator(ENGLISH)).toHaveText('This line comes from a file.');

    await seek(page, 2.1);
    await expect(page.locator(ENGLISH)).toBeHidden();
    const later = page.locator(OVERLAY).getByRole('button', { name: 'Atrasar a legenda' });
    const earlier = page.locator(OVERLAY).getByRole('button', { name: 'Adiantar a legenda' });
    await later.click();
    await later.click();
    await expect(page.locator(`${OVERLAY} .delay`)).toHaveText('+0,2 s');
    await expect(page.locator(ENGLISH)).toHaveText('This line comes from a file.');

    for (let press = 0; press < 6; press += 1) await earlier.click();
    await expect(page.locator(`${OVERLAY} .delay`)).toHaveText('−0,4 s');
    await expect(page.locator(ENGLISH)).toHaveText('Nobody drew it on the page.');
    expect(await page.evaluate(() => document.querySelector('video')?.paused)).toBe(true);
  });

  test('keeps the translation on screen while the delay changes', async ({ page, context }) => {
    await openLoader(page, context, '/plain-video.html?fake-translator=available');
    await chooseFile(page, LESSON);
    await page.locator('h1').click();
    await seek(page, 1);
    await expect(page.locator(PORTUGUESE)).toHaveText('[pt] This line comes from a file.');
    await page.evaluate(() => {
      const portuguese = document
        .querySelector('projeto-bilingue-legenda')
        ?.shadowRoot?.querySelector<HTMLElement>('.portuguese');
      if (!portuguese) throw new Error('Missing Portuguese line');
      const seen: string[] = [];
      Object.assign(window, { portugueseSeen: seen });
      new MutationObserver(() => {
        seen.push(portuguese.hidden ? '' : portuguese.textContent);
      }).observe(portuguese, {
        childList: true,
        characterData: true,
        subtree: true,
        attributes: true,
      });
    });

    const later = page.locator(OVERLAY).getByRole('button', { name: 'Atrasar a legenda' });
    await later.click();
    await later.click();
    await expect(page.locator(`${OVERLAY} .delay`)).toHaveText('+0,2 s');
    await page.waitForTimeout(300);

    const seen = await page.evaluate(
      () => (window as unknown as { portugueseSeen: string[] }).portugueseSeen,
    );
    expect(seen.filter((text) => text !== '[pt] This line comes from a file.')).toEqual([]);
  });

  test('takes a file dropped on the video and outlines the video while it is dragged', async ({
    page,
    context,
  }) => {
    await openLoader(page, context, '/plain-video.html');
    const box = await page.locator('video').boundingBox();
    if (!box) throw new Error('Missing video box');
    const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const dataTransfer = await page.evaluateHandle(() => {
      const transfer = new DataTransfer();
      const srt = '1\n00:00:00,500 --> 00:00:02,000\nDropped on the video.\n';
      transfer.items.add(new File([srt], 'dropped.srt'));
      return transfer;
    });
    const fire = (type: string) =>
      page.evaluate(
        ({ type, point, transfer }) => {
          const target = document.elementFromPoint(point.x, point.y) ?? document.body;
          target.dispatchEvent(
            new DragEvent(type, {
              bubbles: true,
              cancelable: true,
              composed: true,
              clientX: point.x,
              clientY: point.y,
              dataTransfer: transfer,
            }),
          );
        },
        { type, point, transfer: dataTransfer },
      );

    await fire('dragenter');
    await fire('dragover');
    await expect(page.locator(`${OVERLAY} .drop-outline`)).toBeVisible();
    await fire('drop');

    await expect(page.locator(`${OVERLAY} .drop-outline`)).toBeHidden();
    await expect(page.locator(STRIP)).toContainText('Lendo dropped.srt.');
    await seek(page, 1);
    await expect(page.locator(ENGLISH)).toHaveText('Dropped on the video.');
  });

  test('explains a file that is not a subtitle and lets the person choose again', async ({
    page,
    context,
  }) => {
    await openLoader(page, context, '/plain-video.html');
    await chooseFile(page, {
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Words to review: abstain, bargain.'),
    });

    await expect(page.locator(STRIP)).toContainText(
      'Esse arquivo não tem uma legenda .srt ou .vtt que dê para ler.',
    );
    await chooseFile(page, LESSON);
    await expect(page.locator(STRIP)).toContainText('Lendo lesson.srt.');
  });

  test('puts the file above the English track the site already has', async ({ page, context }) => {
    await openLoader(page, context, '/native-tracks.html');
    await chooseFile(page, LESSON);
    await seek(page, 0.75);

    await expect(page.locator(ENGLISH)).toHaveText('This line comes from a file.');
    await expect(page.locator(PORTUGUESE)).not.toHaveText('Olá, esta é a página de teste.');
    const modes = await page.evaluate(() =>
      Array.from(document.querySelector('video')?.textTracks ?? [], (track) => track.mode),
    );
    expect(modes).not.toContain('showing');
  });

  test('gives up with Esc and gives back the caption the site had', async ({ page, context }) => {
    await openLoader(page, context, '/native-tracks.html');
    await page.keyboard.press('Escape');

    await expect(page.locator(STRIP)).toHaveCount(0);
    await seek(page, 0.75);
    await expect(page.locator(ENGLISH)).toHaveText('Hello, this is the test page.');
  });
});

test.describe('a player inside a frame', () => {
  async function playerFrame(page: Page): Promise<Frame> {
    const frame = await (await page.locator('iframe').elementHandle()).contentFrame();
    if (!frame) throw new Error('Missing player frame');
    await frame.waitForFunction(() => (document.querySelector('video')?.readyState ?? 0) >= 2);
    return frame;
  }

  async function seekIn(frame: Frame, seconds: number): Promise<void> {
    await frame.evaluate(async (time) => {
      const video = document.querySelector('video');
      if (!video) throw new Error('No video in the frame');
      const seeked = new Promise((resolve) => {
        video.addEventListener('seeked', resolve, { once: true });
      });
      video.currentTime = time;
      await seeked;
    }, seconds);
  }

  function trackModes(frame: Frame): Promise<string[]> {
    return frame.evaluate(() =>
      Array.from(document.querySelector('video')?.textTracks ?? [], (track) => track.mode),
    );
  }

  test('shows the caption over a player that the site puts in a frame', async ({ page }) => {
    await page.goto('/framed-player.html');
    const frame = await playerFrame(page);
    await seekIn(frame, 0.75);

    await expect(frame.locator(ENGLISH)).toHaveText('Hello, this is the test page.');
    await expect(frame.locator(PORTUGUESE)).toHaveText('Olá, esta é a página de teste.');
    await expect(page.locator(OVERLAY)).toHaveCount(0);
  });

  test('shows the caption over a player of another address once both are on', async ({ page }) => {
    await page.goto('/foreign-player.html');
    const frame = await playerFrame(page);
    expect(new URL(frame.url()).host).toBe('player.localhost:4321');
    await seekIn(frame, 0.75);

    await expect(frame.locator(ENGLISH)).toHaveText('Hello, this is the test page.');
    expect(await trackModes(frame)).toEqual(['hidden', 'hidden']);
  });

  test('stays out of a frame when the page around it was not turned on', async ({ page }) => {
    await page.goto('http://outro-site.localhost:4321/framed-player.html');
    const frame = await playerFrame(page);
    await seekIn(frame, 0.75);
    await page.waitForTimeout(1500);

    await expect(frame.locator(OVERLAY)).toHaveCount(0);
    expect(await trackModes(frame)).toEqual(['showing', 'disabled']);
  });
});
