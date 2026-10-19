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
