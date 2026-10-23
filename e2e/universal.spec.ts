import { fileURLToPath } from 'node:url';
import type { BrowserContext, Frame, Page } from '@playwright/test';
import { expect, test, turnSitesOff } from './fixtures';

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

type DialogueLayout = { dashes: number[]; leftGap: number; rightGap: number };

async function dialogueLayout(page: Page, lines: string): Promise<DialogueLayout> {
  return page.evaluate(
    ({ host, selector }) => {
      const root = document.querySelector(host)?.shadowRoot;
      const subtitle = root?.querySelector('.subtitle');
      if (!root || !subtitle) throw new Error('No subtitle on screen');
      const shown = Array.from(root.querySelectorAll(selector));
      const dashes = shown.flatMap((line) => {
        const text = line.firstChild;
        if (!(text instanceof Text)) throw new Error('A line without text');
        return [0, text.data.indexOf('\n') + 1].map((offset) => {
          const range = document.createRange();
          range.setStart(text, offset);
          range.setEnd(text, offset + 1);
          return range.getBoundingClientRect().left;
        });
      });
      const textRects = shown.flatMap((line) => {
        const range = document.createRange();
        range.selectNodeContents(line);
        return Array.from(range.getClientRects());
      });
      const box = subtitle.getBoundingClientRect();
      return {
        dashes,
        leftGap: Math.min(...textRects.map((rect) => rect.left)) - box.left,
        rightGap: box.right - Math.max(...textRects.map((rect) => rect.right)),
      };
    },
    { host: OVERLAY, selector: lines },
  );
}

function expectOneDashColumnInTheMiddle(layout: DialogueLayout, dashCount: number): void {
  expect(layout.dashes).toHaveLength(dashCount);
  for (const dash of layout.dashes) {
    expect(Math.abs(dash - (layout.dashes[0] ?? 0))).toBeLessThan(1);
  }
  expect(Math.abs(layout.leftGap - layout.rightGap)).toBeLessThan(1);
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

type PageAnswer = { reply: unknown } | { error: string };

async function askTestPage(context: BrowserContext, message: object): Promise<PageAnswer> {
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  return worker.evaluate(async (sent) => {
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
    try {
      return { reply: await tabs.sendMessage(tab.id, sent) };
    } catch (error) {
      return { error: String(error) };
    }
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

test('gets out of the way while the person keeps the site turned off', async ({
  context,
  page,
}) => {
  const trackModes = () =>
    page.evaluate(() =>
      Array.from(document.querySelector('video')?.textTracks ?? [], (track) => track.mode),
    );
  await page.goto('/native-tracks.html');
  await seek(page, 0.75);
  await expect(page.locator(ENGLISH)).toBeVisible();

  await turnSitesOff(context, ['localhost']);
  await expect(page.locator(ENGLISH)).toHaveCount(0);
  expect(await trackModes()).toEqual(['showing', 'disabled']);
  await page.locator('h1').click();
  await page.keyboard.press('z');
  expect(await page.evaluate(() => document.querySelector('video')?.playbackRate)).toBe(1);

  await page.reload();
  await seek(page, 0.75);
  await expect(page.locator(OVERLAY)).toBeAttached();
  await expect(page.locator(ENGLISH)).toHaveCount(0);
  expect(await trackModes()).toEqual(['showing', 'disabled']);

  await turnSitesOff(context, []);
  await expect(page.locator(ENGLISH)).toHaveText('Hello, this is the test page.');
  expect(await trackModes()).toEqual(['hidden', 'hidden']);
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
      'Lendo lesson.srt. Use Atraso − + junto da legenda para acertar o tempo.',
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

  test('lines up the English dashes alone when the Portuguese is not a dialogue', async ({
    page,
    context,
  }) => {
    await openLoader(page, context, '/plain-video.html?fake-translator=available');
    await chooseFile(page, {
      name: 'dialogue.srt',
      mimeType: 'application/x-subrip',
      buffer: Buffer.from(
        '1\n00:00:00,500 --> 00:00:02,000\n- Where are you going?\n- Home, before it starts to rain.\n',
      ),
    });
    await page.locator('h1').click();
    await seek(page, 1);
    await expect(page.locator(PORTUGUESE)).toHaveText(
      '[pt] - Where are you going?\n- Home, before it starts to rain.',
    );

    expectOneDashColumnInTheMiddle(await dialogueLayout(page, '.english'), 2);
    await expect(page.locator(PORTUGUESE)).toHaveCSS('text-align', 'center');
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

  test('fits a very long line inside a small player while the video plays', async ({
    page,
    context,
  }) => {
    await page.addInitScript(() => {
      const errors: string[] = [];
      Object.assign(window, { pageErrors: errors });
      window.addEventListener('error', (event) => errors.push(event.message));
    });
    await openLoader(page, context, '/plain-video.html?fake-translator=available');
    await page.addStyleTag({ content: 'video { width: 400px; height: 225px; }' });
    const long =
      'Listen, I know you think this is all my fault, and maybe some of it is, but you have to understand that I never meant for any of this to happen, not the fire, not the money, none of it.';
    await chooseFile(page, {
      name: 'long.srt',
      mimeType: 'application/x-subrip',
      buffer: Buffer.from(`1\n00:00:00,500 --> 00:00:11,000\n${long}\n`),
    });
    await expect(page.locator(STRIP)).toContainText('Lendo long.srt.');
    await page.mouse.move(0, 0);
    await page.evaluate(async () => {
      const video = document.querySelector('video');
      if (!video) throw new Error('No video');
      video.currentTime = 1;
      await video.play();
    });
    await expect(page.locator(ENGLISH)).toHaveText(long);
    await expect(page.locator(PORTUGUESE)).toHaveText(`[pt] ${long}`);

    await expect
      .poll(async () => {
        const video = await page.locator('video').boundingBox();
        const box = await page.locator(`${OVERLAY} .box`).boundingBox();
        if (!video || !box) return 'missing';
        return box.y >= video.y && box.y + box.height <= video.y + video.height + 0.5;
      })
      .toBe(true);
    const fontPx = await page
      .locator(ENGLISH)
      .evaluate((english) => Number.parseFloat(getComputedStyle(english).fontSize));
    expect(fontPx).toBeGreaterThanOrEqual(16);
    expect(fontPx).toBeLessThan(20);
    expect(
      await page.evaluate(() => (window as unknown as { pageErrors: string[] }).pageErrors),
    ).toEqual([]);
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

  test('keeps the delay when the session starts again, and resets it for a new file', async ({
    page,
    context,
  }) => {
    await openLoader(page, context, '/plain-video.html');
    await chooseFile(page, LESSON);
    const later = page.locator(OVERLAY).getByRole('button', { name: 'Atrasar a legenda' });
    await later.click();
    await later.click();
    await expect(page.locator(`${OVERLAY} .delay`)).toHaveText('+0,2 s');

    await sendToTestPage(context, LOAD);
    await expect(page.locator(STRIP)).toContainText('Solte aqui um arquivo .srt ou .vtt.');
    await page.keyboard.press('Escape');
    await expect(page.locator(`${OVERLAY} .delay`)).toHaveText('+0,2 s');
    await seek(page, 2.1);
    await expect(page.locator(ENGLISH)).toHaveText('This line comes from a file.');

    await sendToTestPage(context, LOAD);
    await chooseFile(page, LESSON);
    await expect(page.locator(`${OVERLAY} .delay`)).toHaveText('0 s');
    await expect(page.locator(ENGLISH)).toBeHidden();
  });

  test('swaps the strip that is leaving for the one the person opens next', async ({
    page,
    context,
  }) => {
    const pick = { type: 'projeto-bilingue:pick-caption' };
    const strips = page.locator(`${OVERLAY} .picker-strip`);
    await openLoader(page, context, '/screen-captions.html');
    await chooseFile(page, LESSON);
    await expect(strips).toContainText('Lendo lesson.srt');
    await seek(page, 1);

    await sendToTestPage(context, pick);
    await expect(strips).toHaveCount(1);
    await expect(strips).toContainText('Clique na legenda do vídeo. Esc cancela.');
    await page.locator('.fp-line').click();
    await expect(strips).toContainText('aprendida');

    await sendToTestPage(context, LOAD);
    await expect(strips).toHaveCount(1);
    await expect(strips).toContainText('Solte aqui um arquivo .srt ou .vtt.');
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

  test('follows the page around the player when the person turns that site off', async ({
    page,
    context,
  }) => {
    await page.goto('/foreign-player.html');
    const frame = await playerFrame(page);
    await seekIn(frame, 0.75);
    await expect(frame.locator(ENGLISH)).toBeVisible();

    await turnSitesOff(context, ['player.localhost']);
    await page.waitForTimeout(300);
    await expect(frame.locator(ENGLISH)).toBeVisible();

    await turnSitesOff(context, ['localhost']);
    await expect(frame.locator(ENGLISH)).toHaveCount(0);
    expect(await trackModes(frame)).toEqual(['showing']);
  });

  test('shows the caption over a player of another address once both are on', async ({ page }) => {
    await page.goto('/foreign-player.html');
    const frame = await playerFrame(page);
    expect(new URL(frame.url()).host).toBe('player.localhost:4321');
    await seekIn(frame, 0.75);

    await expect(frame.locator(ENGLISH)).toHaveText('Hello, this is the test page.');
    expect(await trackModes(frame)).toEqual(['hidden']);
  });

  test('translates inside a player of another address through the page around it', async ({
    page,
  }) => {
    await page.goto('/foreign-player.html?fake-translator=available');
    const frame = await playerFrame(page);
    await seekIn(frame, 0.75);

    await expect(frame.locator(PORTUGUESE)).toHaveText('[pt] Hello, this is the test page.');
    await expect(page.locator('html')).toHaveAttribute('data-fake-translations', /^[1-9]/);
    expect(await frame.evaluate(() => document.documentElement.dataset.fakeTranslations)).toBe(
      undefined,
    );
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

test.describe('when the site changes under the extension', () => {
  const ASK = { type: 'projeto-bilingue:site-problem' };

  async function storeRule(context: BrowserContext, captionSelector: string): Promise<void> {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    await worker.evaluate(
      (selector) =>
        (
          globalThis as unknown as {
            chrome: { storage: { local: { set: (items: object) => Promise<void> } } };
          }
        ).chrome.storage.local.set({
          siteRules: { 'localhost:4321': { captionSelector: selector } },
        }),
      captionSelector,
    );
  }

  test('says nothing to the popup while everything works', async ({ page, context }) => {
    await page.goto('/native-tracks.html');
    await seek(page, 0.75);
    await expect(page.locator(ENGLISH)).toBeVisible();

    expect(await askTestPage(context, ASK)).toEqual({ reply: undefined });
  });

  test('steps aside after an error, gives the site its caption and keys back and tells the popup', async ({
    page,
    context,
  }) => {
    await storeRule(context, 'div.fp-captions span[');
    await page.goto('/screen-captions.html');
    await expect(page.locator(OVERLAY)).toBeAttached();
    await seek(page, 1);

    await expect(page.locator('.fp-line')).toHaveText('Hello, this is the test page.');
    await expect(page.locator('.fp-line')).toHaveCSS('visibility', 'visible');
    await expect(page.locator(`${OVERLAY} .frame`)).toHaveCount(0);
    await page.locator('h1').click();
    await page.keyboard.press('z');
    expect(await page.evaluate(() => document.querySelector('video')?.playbackRate)).toBe(1);
    expect(await askTestPage(context, ASK)).toEqual({ reply: { problem: 'stopped' } });
  });

  test('tells the popup when the learned caption does not show up for 10 s', async ({
    page,
    context,
  }) => {
    await storeRule(context, 'div.old-captions span.old-line');
    await page.goto('/screen-captions.html');
    await expect(page.locator(OVERLAY)).toBeAttached();
    await page.evaluate(() => document.querySelector('video')?.play());
    expect(await askTestPage(context, ASK)).toEqual({ reply: undefined });

    await seek(page, 11);
    await expect
      .poll(() => askTestPage(context, ASK))
      .toEqual({
        reply: { problem: 'learned-caption-missing' },
      });
    await expect(page.locator('.fp-line')).toHaveCSS('visibility', 'visible');
  });
});

test('lines up the dashes of two speakers in one column, in the middle of the video', async ({
  page,
}) => {
  const tracks = {
    'subtitles.vtt': '- Where are you going?\n- Home, before it starts to rain.',
    'subtitles.pt.vtt': '- Aonde você vai?\n- Para casa, antes que comece a chover.',
  };
  for (const [file, text] of Object.entries(tracks)) {
    await page.route(`**/${file}`, (route) =>
      route.fulfill({
        contentType: 'text/vtt',
        body: `WEBVTT\n\n00:00:00.500 --> 00:00:05.000\n${text}\n`,
      }),
    );
  }
  await page.goto('/native-tracks.html');
  await expect(page.locator(OVERLAY)).toBeAttached();
  await seek(page, 1);
  await expect(page.locator(PORTUGUESE)).toHaveText(tracks['subtitles.pt.vtt']);

  expectOneDashColumnInTheMiddle(await dialogueLayout(page, '.english, .portuguese'), 4);
});

test.describe('a video put in full screen on its own', () => {
  async function coverState(page: Page) {
    return page.evaluate((host) => {
      const container = document.querySelector(host)?.shadowRoot?.querySelector('div');
      if (!container) throw new Error('No caption container');
      const rect = container.getBoundingClientRect();
      return {
        onTop: container.matches(':popover-open'),
        rect: [rect.left, rect.top, rect.width, rect.height].map(Math.round),
        viewport: [window.innerWidth, window.innerHeight],
      };
    }, OVERLAY);
  }

  test.beforeEach(async ({ page }) => {
    await page.goto('/native-tracks.html');
    await expect(page.locator(OVERLAY)).toBeAttached();
    await seek(page, 0.75);
    await expect(page.locator(ENGLISH)).toBeVisible();
    await page.locator('h1').click();
    await page.evaluate(() => document.querySelector('video')?.requestFullscreen());
    await expect.poll(() => page.evaluate(() => document.fullscreenElement?.tagName)).toBe('VIDEO');
  });

  test('keeps the caption over the whole screen, without the strip', async ({ page }) => {
    await expect.poll(() => coverState(page)).toMatchObject({ onTop: true });
    const { rect, viewport } = await coverState(page);
    expect(rect).toEqual([0, 0, ...viewport]);
    await expect(page.locator(ENGLISH)).toHaveText('Hello, this is the test page.');
    await expect(page.locator(PORTUGUESE)).toHaveText('Olá, esta é a página de teste.');
    await expect(page.locator(`${OVERLAY} .strip`)).toBeHidden();
  });

  test('still answers the study keys', async ({ page }) => {
    await page.keyboard.press('z');
    await expect
      .poll(() => page.evaluate(() => document.querySelector('video')?.playbackRate))
      .toBe(0.95);
  });

  test('goes back over the video when the full screen ends', async ({ page }) => {
    await page.evaluate(() => document.exitFullscreen());
    await expect.poll(() => coverState(page)).toMatchObject({ onTop: false });
    const videoRect = await page.locator('video').evaluate((video) => {
      const rect = video.getBoundingClientRect();
      return [rect.left, rect.top, rect.width, rect.height].map(Math.round);
    });
    expect((await coverState(page)).rect).toEqual(videoRect);
    await expect(page.locator(ENGLISH)).toHaveText('Hello, this is the test page.');
  });
});

test.describe('the native control bar of the video', () => {
  async function gapAboveBottom(page: Page): Promise<number> {
    await page.waitForFunction((host) => {
      const box = document.querySelector(host)?.shadowRoot?.querySelector('.box');
      return box !== null && box !== undefined && box.getAnimations().length === 0;
    }, OVERLAY);
    return page.evaluate((host) => {
      const box = document.querySelector(host)?.shadowRoot?.querySelector('.box');
      const video = document.querySelector('video');
      if (!box || !video) throw new Error('Missing box or video');
      return Math.round(video.getBoundingClientRect().bottom - box.getBoundingClientRect().bottom);
    }, OVERLAY);
  }

  test.beforeEach(async ({ page }) => {
    await page.route('**/subtitles.vtt', (route) =>
      route.fulfill({
        contentType: 'text/vtt',
        body: 'WEBVTT\n\n00:00:00.000 --> 00:00:12.000\nHello, this is the test page.\n',
      }),
    );
    await page.goto('/native-tracks.html');
    await expect(page.locator(OVERLAY)).toBeAttached();
    await seek(page, 0.75);
    await expect(page.locator(ENGLISH)).toBeVisible();
  });

  test('keeps the caption above the bar while the video is paused', async ({ page }) => {
    await expect.poll(() => gapAboveBottom(page)).toBe(62);
  });

  test('lets the caption down while the video plays, and up while the pointer moves over it', async ({
    page,
  }) => {
    await page.mouse.move(900, 600);
    await page.evaluate(() => document.querySelector('video')?.play());
    await expect.poll(() => gapAboveBottom(page)).toBe(11);

    const video = await page.locator('video').boundingBox();
    if (!video) throw new Error('No video box');
    await page.mouse.move(video.x + video.width / 2, video.y + 40);
    await expect.poll(() => gapAboveBottom(page)).toBe(62);
    await expect.poll(() => gapAboveBottom(page), { timeout: 4000 }).toBe(11);
  });
});

test.describe('a speed chosen in the player of the site', () => {
  const SPEED = `${OVERLAY} .speed`;

  async function rate(page: Page): Promise<number | undefined> {
    return page.evaluate(() => document.querySelector('video')?.playbackRate);
  }

  test.beforeEach(async ({ page }) => {
    await page.goto('/speed-menu.html');
    await expect(page.locator(OVERLAY)).toBeAttached();
    await seek(page, 0.75);
    await expect(page.locator(ENGLISH)).toBeVisible();
    await page.locator('h1').click();
    await page.keyboard.press('z');
    await expect.poll(() => rate(page)).toBe(0.95);
  });

  test('keeps the speed the person picks in the menu of the player', async ({ page }) => {
    await page.getByRole('button', { name: 'Speed 1.5x' }).click();

    await expect(page.locator(SPEED)).toHaveText('1,5x');
    expect(await rate(page)).toBe(1.5);
  });

  test('brings its speed back when the site resets it while loading the next video', async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'Next lesson' }).click();

    await expect
      .poll(() => page.evaluate(() => document.querySelector('video')?.currentSrc))
      .toContain('lesson=2');
    await expect.poll(() => rate(page)).toBe(0.95);
    await expect(page.locator(SPEED)).toHaveText('0,95x');
  });
});
