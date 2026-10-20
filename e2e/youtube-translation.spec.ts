import type { Page } from '@playwright/test';
import { openFakeYouTube } from './fake-youtube';
import { expect, test } from './fixtures';

const OVERLAY = 'projeto-bilingue-legenda';
const ENGLISH = `${OVERLAY} .english`;
const PORTUGUESE = `${OVERLAY} .portuguese`;

let leakedRequests: string[] = [];

test.afterEach(() => {
  expect(leakedRequests).toEqual([]);
});

async function open(page: Page, videoId: string, fakeTranslator?: string): Promise<void> {
  leakedRequests = await openFakeYouTube(page, videoId, fakeTranslator);
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

function translationsMade(page: Page): Promise<string | undefined> {
  return page.evaluate(() => document.documentElement.dataset.fakeTranslations);
}

test('says for five seconds when the device cannot translate to Portuguese', async ({ page }) => {
  await open(page, 'video-a');
  await expect(page.locator(ENGLISH)).toHaveText('First line of video A');
  await expect(page.locator(PORTUGUESE)).toHaveText('Este navegador não traduz para o português.');
  await expect(page.locator(PORTUGUESE)).toHaveClass(/translation-state/);
  await expect(page.locator(PORTUGUESE)).toBeHidden({ timeout: 7000 });
  await expect(page.locator(ENGLISH)).toHaveText('First line of video A');
});

test('translates the English caption and shows it underneath', async ({ page }) => {
  await open(page, 'video-a', 'available');
  await expect(page.locator(ENGLISH)).toHaveText('First line of video A');
  await expect(page.locator(PORTUGUESE)).toHaveText('[pt] First line of video A');
  await expect(page.locator(PORTUGUESE)).not.toHaveClass(/translation-state/);
});

test('downloads the model on the first click on the page and then translates', async ({ page }) => {
  await open(page, 'video-a', 'downloadable');
  await expect(page.locator(PORTUGUESE)).toHaveText('Clique na página para ligar o português.');
  expect(await translationsMade(page)).toBeUndefined();

  await page.locator('body').click({ position: { x: 4, y: 4 } });
  await expect(page.locator(PORTUGUESE)).toHaveText('Baixando o português… 50%');
  await expect(page.locator(PORTUGUESE)).toHaveText('[pt] First line of video A');
});

test('tells when the download fails', async ({ page }) => {
  await open(page, 'video-a', 'broken-download');
  await page.locator('body').click({ position: { x: 4, y: 4 } });
  await expect(page.locator(PORTUGUESE)).toHaveText(
    'Não deu para baixar o português. Recarregue a página.',
  );
});

test('prefers the official Portuguese track once the player downloads it', async ({ page }) => {
  await open(page, 'video-a', 'available');
  await expect(page.locator(PORTUGUESE)).toHaveText('[pt] First line of video A');

  await fakePlayer(page, 'loadPortuguese');
  await expect(page.locator(PORTUGUESE)).toHaveText('Legenda oficial do vídeo A');
  await expect(page.locator(ENGLISH)).toHaveText('First line of video A');
});

test('keeps the translation when the player downloads the automatic Portuguese track', async ({
  page,
}) => {
  await open(page, 'video-a', 'available');
  await expect(page.locator(PORTUGUESE)).toHaveText('[pt] First line of video A');

  const automatic = page.waitForResponse((response) => response.url().includes('kind=asr'));
  await fakePlayer(page, 'loadAutomaticPortuguese');
  await automatic;
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await expect(page.locator(PORTUGUESE)).toHaveText('[pt] First line of video A');
});

test('reuses saved translations on the next visit without translating again', async ({ page }) => {
  await open(page, 'video-a', 'available');
  await expect(page.locator(PORTUGUESE)).toHaveText('[pt] First line of video A');
  expect(await translationsMade(page)).toBe('2');

  await page.reload();
  await expect(page.locator(PORTUGUESE)).toHaveText('[pt] First line of video A');
  expect(await translationsMade(page)).toBeUndefined();
});

test('translates the next video without reloading the page', async ({ page }) => {
  await open(page, 'video-a', 'available');
  await expect(page.locator(PORTUGUESE)).toHaveText('[pt] First line of video A');

  await fakePlayer(page, 'openVideo', 'video-b');
  await expect(page.locator(ENGLISH)).toHaveText('Only line of video B');
  await expect(page.locator(PORTUGUESE)).toHaveText('[pt] Only line of video B');
});

test('translates the caption read from the screen line by line', async ({ page }) => {
  await open(page, 'no-captions', 'available');
  await fakePlayer(page, 'showScreenCaption', 'so today we are going');
  await expect(page.locator(ENGLISH)).toHaveText('so today we are going');
  await expect(page.locator(PORTUGUESE)).toHaveText('[pt] so today we are going');
});
