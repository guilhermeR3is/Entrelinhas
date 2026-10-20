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

test('Z slows the video down on any site', async ({ page }) => {
  await page.goto('/native-tracks.html');
  await expect(page.locator(OVERLAY)).toBeAttached();
  await page.locator('h1').click();
  await page.keyboard.press('z');
  await expect
    .poll(() => page.evaluate(() => document.querySelector('video')?.playbackRate))
    .toBe(0.95);
});
