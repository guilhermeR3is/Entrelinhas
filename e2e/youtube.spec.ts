import type { Page } from '@playwright/test';
import { openFakeYouTube } from './fake-youtube';
import { expect, test } from './fixtures';

const OVERLAY = 'projeto-bilingue-legenda';
const ENGLISH = `${OVERLAY} .english`;

let leakedRequests: string[] = [];

test.afterEach(() => {
  expect(leakedRequests).toEqual([]);
});

async function open(page: Page, videoId: string): Promise<void> {
  leakedRequests = await openFakeYouTube(page, videoId);
  await expect(page.locator(OVERLAY)).toBeAttached();
}

function fakePlayer(page: Page, action: string, argument?: string): Promise<void> {
  return page.evaluate(
    ([name, value]) => {
      const player = (window as unknown as { fakePlayer: Record<string, (arg?: string) => void> })
        .fakePlayer;
      player[name ?? '']?.(value);
    },
    [action, argument],
  );
}

function play(page: Page): Promise<void> {
  return page.evaluate(() => document.querySelector('video')?.play());
}

function nativeCaptionsVisibility(page: Page): Promise<string | undefined> {
  return page.evaluate(
    () => document.querySelector<HTMLElement>('#ytp-caption-window-container')?.style.visibility,
  );
}

test('shows the caption the player downloaded and hides the one from YouTube', async ({ page }) => {
  await open(page, 'video-a');
  await expect(page.locator(ENGLISH)).toHaveText('First line of video A');
  expect(await nativeCaptionsVisibility(page)).toBe('hidden');
});

test('draws the caption on top of the video layer', async ({ page }) => {
  await open(page, 'video-a');
  await expect(page.locator(ENGLISH)).toBeVisible();

  const topElement = await page.evaluate((overlay) => {
    const root = document.querySelector(overlay)?.shadowRoot;
    const frame = root?.querySelector<HTMLElement>('.frame');
    const box = root?.querySelector('.subtitle')?.getBoundingClientRect();
    if (!frame || !box) return null;
    frame.style.pointerEvents = 'auto';
    const element = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    frame.style.pointerEvents = '';
    return element?.tagName.toLowerCase();
  }, OVERLAY);
  expect(topElement).toBe(OVERLAY);
});

test('follows the video while it plays', async ({ page }) => {
  await open(page, 'video-a');
  await play(page);
  await expect(page.locator(ENGLISH)).toHaveText('Second line of video A');
});

function gapAboveControls(page: Page): Promise<number | null> {
  return page.evaluate((overlay) => {
    const subtitle = document
      .querySelector(overlay)
      ?.shadowRoot?.querySelector('.subtitle')
      ?.getBoundingClientRect();
    const controls = document.querySelector('.ytp-chrome-bottom')?.getBoundingClientRect();
    return subtitle && controls ? Math.round(controls.top - subtitle.bottom) : null;
  }, OVERLAY);
}

function englishFontSizePx(page: Page): Promise<number> {
  return page
    .locator(ENGLISH)
    .evaluate((english) => Number.parseFloat(getComputedStyle(english).fontSize));
}

test('sits above the player controls and goes back down when they hide', async ({ page }) => {
  await open(page, 'video-a');
  await expect.poll(() => gapAboveControls(page)).toBe(8);
  await fakePlayer(page, 'hideControls');
  await expect.poll(() => gapAboveControls(page)).toBe(-40);
});

test('grows with the player in fullscreen and shrinks back when it ends', async ({ page }) => {
  await open(page, 'video-a');
  await expect.poll(() => englishFontSizePx(page)).toBe(20);

  await page.locator('.ytp-fullscreen-button').click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.tagName)).toBe('HTML');
  const playerHeight = await page.evaluate(() => window.innerHeight);
  await expect.poll(() => englishFontSizePx(page)).toBeCloseTo(playerHeight * 0.04);
  await expect(page.locator(ENGLISH)).toHaveText('First line of video A');
  await expect.poll(() => gapAboveControls(page)).toBe(8);

  await page.evaluate(() => document.exitFullscreen());
  await expect.poll(() => englishFontSizePx(page)).toBe(20);
});

test('follows the player into theater mode', async ({ page }) => {
  await open(page, 'video-a');
  await fakePlayer(page, 'enterTheaterMode');
  await expect.poll(() => englishFontSizePx(page)).toBeCloseTo(631 * 0.04);
  await expect(page.locator(ENGLISH)).toHaveText('First line of video A');
  await expect.poll(() => gapAboveControls(page)).toBe(8);

  await play(page);
  await expect(page.locator(ENGLISH)).toHaveText('Second line of video A');
});

test('stays out of the way while an ad plays', async ({ page }) => {
  await open(page, 'video-a');
  await play(page);
  await fakePlayer(page, 'startAd');
  await expect(page.locator(`${OVERLAY} .subtitle`)).toBeHidden();
  await expect.poll(() => nativeCaptionsVisibility(page)).toBe('');

  await fakePlayer(page, 'endAd');
  await expect(page.locator(`${OVERLAY} .subtitle`)).toBeVisible();
});

test('keeps hiding the YouTube captions after the player rebuilds them', async ({ page }) => {
  await open(page, 'video-a');
  await play(page);
  await fakePlayer(page, 'replaceCaptionContainer');
  await expect.poll(() => nativeCaptionsVisibility(page)).toBe('hidden');
});

test('switches captions with the video without reloading the page', async ({ page }) => {
  await open(page, 'video-a');
  await expect(page.locator(ENGLISH)).toHaveText('First line of video A');
  await fakePlayer(page, 'openVideo', 'video-b');
  await expect(page.locator(ENGLISH)).toHaveText('Only line of video B');
});

test('asks to turn captions on when the video has none playing', async ({ page }) => {
  await open(page, 'no-captions');
  await play(page);
  await expect(page.locator(`${OVERLAY} .status .word-class`)).toHaveText('desligada');
});

function speed(page: Page): Promise<number | undefined> {
  return page.evaluate(() => document.querySelector('video')?.playbackRate);
}

function keysSeenByPage(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    (window as unknown as { fakePlayer: { keysSeen: () => string[] } }).fakePlayer.keysSeen(),
  );
}

test('Z and X change the speed without reaching the page, other keys pass', async ({ page }) => {
  await open(page, 'video-a');
  await page.keyboard.press('z');
  await page.keyboard.press('z');
  await page.keyboard.press('x');
  await expect.poll(() => speed(page)).toBe(0.95);
  await page.keyboard.press('k');
  expect(await keysSeenByPage(page)).toEqual(['k']);
});

test('typing in the search box does not change the speed', async ({ page }) => {
  await open(page, 'video-a');
  await page.locator('#search').pressSequentially('xz');
  await expect(page.locator('#search')).toHaveValue('xz');
  expect(await speed(page)).toBe(1);
});

test('keeps the chosen speed when the player puts its own back on a new video', async ({
  page,
}) => {
  await open(page, 'video-a');
  await page.keyboard.press('z');
  await fakePlayer(page, 'openVideo', 'video-b');
  await expect(page.locator(ENGLISH)).toHaveText('Only line of video B');
  await page.waitForTimeout(300);
  expect(await speed(page)).toBe(0.95);
});

test('follows the speed the person picks in the player menu', async ({ page }) => {
  await open(page, 'video-a');
  await page.keyboard.press('z');
  await page.locator('.ytp-speed-option').click();
  await page.waitForTimeout(100);
  expect(await speed(page)).toBe(1.5);
  await page.locator('body').press('x');
  await expect.poll(() => speed(page)).toBe(1.55);
});

test('plays the ad at normal speed and restores the chosen speed after it', async ({ page }) => {
  await open(page, 'video-a');
  await page.keyboard.press('z');
  await play(page);
  await fakePlayer(page, 'startAd');
  await expect.poll(() => speed(page)).toBe(1);
  await page.keyboard.press('z');
  expect(await keysSeenByPage(page)).toEqual(['z']);

  await fakePlayer(page, 'endAd');
  await expect.poll(() => speed(page)).toBe(0.95);
});

const STRIP = `${OVERLAY} .strip`;

test('shows the study strip while paused, hides it while playing and brings it back on hover', async ({
  page,
}) => {
  await open(page, 'video-a');
  await expect(page.locator(STRIP)).toBeVisible();
  await play(page);
  await page.mouse.move(5, 5);
  await expect(page.locator(STRIP)).toBeHidden();

  await page.locator(ENGLISH).hover();
  await expect(page.locator(STRIP)).toBeVisible();
});

test('shows the new speed on the strip after a key, then hides it again', async ({ page }) => {
  await open(page, 'video-a');
  await play(page);
  await page.mouse.move(5, 5);
  await page.keyboard.press('z');
  await expect(page.locator(`${STRIP} .speed`)).toHaveText('0,95x');
  await expect(page.locator(STRIP)).toBeVisible();
  await expect(page.locator(STRIP)).toBeHidden({ timeout: 3000 });
});

test('the strip buttons change the speed and keep their keys away from the player', async ({
  page,
}) => {
  await open(page, 'video-a');
  await page.getByRole('button', { name: 'Mais rápido' }).click();
  await expect(page.locator(`${STRIP} .speed`)).toHaveText('1,05x');
  await page.getByRole('button', { name: 'Mais devagar' }).focus();
  await page.keyboard.press('Space');
  await expect.poll(() => speed(page)).toBe(1);
  expect(await keysSeenByPage(page)).toEqual([]);
});

test('keeps the study strip away during an ad', async ({ page }) => {
  await open(page, 'video-a');
  await play(page);
  await fakePlayer(page, 'startAd');
  await page.mouse.move(427, 400);
  await expect(page.locator(STRIP)).toBeHidden();
  await fakePlayer(page, 'endAd');
  await page.locator(ENGLISH).hover();
  await expect(page.locator(STRIP)).toBeVisible();
});

test('P pauses the video where the caption ends and keeps it on screen', async ({ page }) => {
  await open(page, 'video-a');
  await page.keyboard.press('p');
  await expect(page.getByRole('button', { name: 'Pausar no fim' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await play(page);
  await expect
    .poll(() => page.evaluate(() => document.querySelector('video')?.paused), { timeout: 6000 })
    .toBe(true);
  const stoppedMs = await page.evaluate(() =>
    Math.round((document.querySelector('video')?.currentTime ?? 0) * 1000),
  );
  expect(stoppedMs).toBeGreaterThanOrEqual(3000);
  expect(stoppedMs).toBeLessThan(3100);
  await expect(page.locator(ENGLISH)).toHaveText('First line of video A');
  expect(await keysSeenByPage(page)).toEqual([]);
});

test('R goes back to the start of the caption and keeps it from the page', async ({ page }) => {
  await open(page, 'video-a');
  await play(page);
  await expect
    .poll(() => page.evaluate(() => document.querySelector('video')?.currentTime ?? 0))
    .toBeGreaterThan(1);
  await page.keyboard.press('r');
  const timeS = await page.evaluate(() => document.querySelector('video')?.currentTime ?? 0);
  expect(timeS).toBeLessThan(0.5);
  await expect(page.getByRole('button', { name: 'Repetir' })).toHaveAttribute(
    'aria-disabled',
    'false',
  );
  expect(await keysSeenByPage(page)).toEqual([]);
});

interface BoxInPlayer {
  left: number;
  top: number;
  right: number;
  bottom: number;
  centerX: number;
  bottomLine: number;
}

async function boxInPlayer(page: Page): Promise<BoxInPlayer> {
  const [box, player] = await Promise.all([
    page.locator(`${OVERLAY} .box`).boundingBox(),
    page.locator('#movie_player').boundingBox(),
  ]);
  if (!box || !player) throw new Error('Missing caption box or player');
  return {
    left: box.x - player.x,
    top: box.y - player.y,
    right: player.x + player.width - (box.x + box.width),
    bottom: player.y + player.height - (box.y + box.height),
    centerX: (box.x + box.width / 2 - player.x) / player.width,
    bottomLine: (box.y + box.height - player.y) / player.height,
  };
}

async function dragHandle(page: Page, to: { x: number; y: number }): Promise<void> {
  const handle = await page.getByRole('button', { name: 'Mover a legenda' }).boundingBox();
  if (!handle) throw new Error('Missing handle');
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
}

test('drags the caption box by its handle and keeps it inside the video', async ({ page }) => {
  await open(page, 'video-a');
  await expect.poll(() => gapAboveControls(page)).toBe(8);
  const handle = await page.getByRole('button', { name: 'Mover a legenda' }).boundingBox();
  if (!handle) throw new Error('Missing handle');
  const before = await boxInPlayer(page);

  await dragHandle(page, {
    x: handle.x + handle.width / 2 - 150,
    y: handle.y + handle.height / 2 - 200,
  });
  const moved = await boxInPlayer(page);
  expect(moved.left).toBeCloseTo(before.left - 150, 0);
  expect(moved.top).toBeCloseTo(before.top - 200, 0);
  await expect(page.locator(ENGLISH)).toHaveText('First line of video A');

  await dragHandle(page, { x: 1200, y: 700 });
  const corner = await boxInPlayer(page);
  expect(corner.right).toBeCloseTo(0, 0);
  expect(corner.bottom).toBeCloseTo(67, 0);
  await fakePlayer(page, 'hideControls');
  await expect.poll(async () => Math.round((await boxInPlayer(page)).bottom)).toBe(0);
  expect(await page.evaluate(() => document.querySelector('video')?.paused)).toBe(true);
});

test('the arrow keys move the box at once and Enter takes it to the top', async ({ page }) => {
  await open(page, 'video-a');
  await expect.poll(() => gapAboveControls(page)).toBe(8);
  await page.getByRole('button', { name: 'Mover a legenda' }).focus();
  const before = await boxInPlayer(page);

  await page.keyboard.press('ArrowUp');
  expect((await boxInPlayer(page)).top).toBeCloseTo(before.top - 24, 0);
  await page.keyboard.press('ArrowLeft');
  expect((await boxInPlayer(page)).left).toBeCloseTo(before.left - 42.7, 0);

  await page.keyboard.press('Enter');
  expect((await boxInPlayer(page)).top).toBeCloseTo(19.2, 0);
  await page.keyboard.press('Space');
  expect((await boxInPlayer(page)).bottom).toBeCloseTo(67, 0);
  expect(await keysSeenByPage(page)).toEqual([]);
});

test('keeps the place of the box in proportion in fullscreen', async ({ page }) => {
  await open(page, 'video-a');
  await page.getByRole('button', { name: 'Mover a legenda' }).focus();
  for (const key of ['ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowLeft', 'ArrowLeft']) {
    await page.keyboard.press(key);
  }
  const before = await boxInPlayer(page);

  await page.locator('.ytp-fullscreen-button').click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.tagName)).toBe('HTML');
  await expect.poll(async () => (await boxInPlayer(page)).centerX).toBeCloseTo(before.centerX, 2);
  expect((await boxInPlayer(page)).bottomLine).toBeCloseTo(before.bottomLine, 2);

  await page.getByRole('button', { name: 'Mover a legenda' }).focus();
  await page.keyboard.press('Enter');
  const fullscreenTop = await boxInPlayer(page);
  const playerHeight = await page.evaluate(() => window.innerHeight);
  expect(fullscreenTop.top).toBeCloseTo(playerHeight * 0.04, 0);
});

test('remembers the speed, the switches and the place of the box on the next visit', async ({
  page,
}) => {
  await open(page, 'video-a');
  await page.keyboard.press('z');
  await page.keyboard.press('p');
  await page.keyboard.press('b');
  await expect.poll(() => gapAboveControls(page)).toBe(8);
  await dragHandle(page, { x: 200, y: 120 });
  const moved = await boxInPlayer(page);

  await open(page, 'video-a');
  await expect.poll(() => speed(page)).toBe(0.95);
  await expect(page.locator(`${STRIP} .speed`)).toHaveText('0,95x');
  await expect(page.getByRole('button', { name: 'Pausar no fim' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('button', { name: 'Borrar português' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect.poll(async () => (await boxInPlayer(page)).top).toBeCloseTo(moved.top, 0);
  expect((await boxInPlayer(page)).centerX).toBeCloseTo(moved.centerX, 2);
});

test('follows keys changed in the options while the video page stays open', async ({
  page,
  context,
  popupUrl,
}) => {
  await open(page, 'video-a');
  const extensionPage = await context.newPage();
  await extensionPage.goto(popupUrl);
  await extensionPage.evaluate(() =>
    (
      globalThis as unknown as {
        chrome: { storage: { local: { set(items: object): Promise<void> } } };
      }
    ).chrome.storage.local.set({ keys: { slower: { key: 'q', shift: false } } }),
  );
  await extensionPage.close();

  await expect(page.getByRole('button', { name: 'Mais devagar' })).toHaveAttribute(
    'aria-keyshortcuts',
    'Q',
  );
  await page.keyboard.press('q');
  await expect.poll(() => speed(page)).toBe(0.95);
  await page.keyboard.press('z');
  expect(await keysSeenByPage(page)).toEqual(['z']);
  expect(await speed(page)).toBe(0.95);
});

test('steps aside when the extension is reloaded while the video page stays open', async ({
  page,
  context,
  popupUrl,
}) => {
  await open(page, 'video-a');
  await expect(page.locator(ENGLISH)).toHaveText('First line of video A');

  const extensionPage = await context.newPage();
  await extensionPage.goto(popupUrl);
  await extensionPage
    .evaluate(() => {
      (
        globalThis as unknown as { chrome: { runtime: { reload(): void } } }
      ).chrome.runtime.reload();
    })
    .catch(() => undefined);
  await expect.poll(() => context.serviceWorkers().length, { timeout: 10_000 }).toBeGreaterThan(0);

  await page.keyboard.press('z');
  await expect(page.locator(OVERLAY)).toHaveCount(0);
  expect(await keysSeenByPage(page)).toEqual(['z']);
  expect(await speed(page)).toBe(1);
});

test('steps aside on the next caption after the extension is reloaded, without any key', async ({
  page,
  context,
  popupUrl,
}) => {
  await open(page, 'video-a');
  await expect(page.locator(ENGLISH)).toHaveText('First line of video A');

  const extensionPage = await context.newPage();
  await extensionPage.goto(popupUrl);
  await extensionPage
    .evaluate(() => {
      (
        globalThis as unknown as { chrome: { runtime: { reload(): void } } }
      ).chrome.runtime.reload();
    })
    .catch(() => undefined);
  await expect.poll(() => context.serviceWorkers().length, { timeout: 10_000 }).toBeGreaterThan(0);

  await fakePlayer(page, 'openVideo', 'video-b');
  await expect(page.locator(OVERLAY)).toHaveCount(0);
});
