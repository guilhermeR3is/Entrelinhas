import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { parseWebVtt } from '../src/subtitles/webvtt';

const subtitles = readFileSync(new URL('./test-page/subtitles.vtt', import.meta.url), 'utf8');

async function seekAndReadCues(page: Page, seconds: number) {
  return page.evaluate(async (time) => {
    const video = document.querySelector('video');
    if (!video) throw new Error('No video on the test page');

    const seeked = new Promise((resolve) => {
      video.addEventListener('seeked', resolve, { once: true });
    });
    video.currentTime = time;
    await seeked;

    const chromeCues = Array.from(video.textTracks[0]?.activeCues ?? [], (cue) =>
      cue instanceof VTTCue ? cue.getCueAsHTML().textContent : '',
    );
    const pageCues = Array.from(
      document.querySelectorAll('#active-cues li'),
      (item) => item.textContent,
    );
    return { chromeCues, pageCues };
  }, seconds);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
});

test('the WebVTT parser reads the same cues as Chrome', async ({ page }) => {
  const chromeCues = await page.evaluate(() =>
    Array.from(document.querySelector('video')?.textTracks[0]?.cues ?? [], (cue) => ({
      startMs: Math.round(cue.startTime * 1000),
      endMs: Math.round(cue.endTime * 1000),
      text: cue instanceof VTTCue ? cue.getCueAsHTML().textContent : '',
    })),
  );

  const parsedCues = parseWebVtt(subtitles, 'en').map(({ startMs, endMs, text }) => ({
    startMs,
    endMs,
    text,
  }));
  expect(parsedCues).toHaveLength(6);
  expect(parsedCues).toEqual(chromeCues);
});

const LONG_CUE = 'A long cue & two short ones\ninside it.';
const SEEKS: [number, string[]][] = [
  [0.25, []],
  [0.75, ['Hello, this is the test page.']],
  [3, ['Cues can touch end to end.']],
  [4.5, [LONG_CUE]],
  [5.5, [LONG_CUE, 'First overlap']],
  [6.5, [LONG_CUE]],
  [7.5, [LONG_CUE, 'Second overlap <3']],
  [9.5, []],
  [10.75, ['After a gap.']],
  [11.75, []],
  [5.5, [LONG_CUE, 'First overlap']],
  [0.75, ['Hello, this is the test page.']],
];

test('the synchronizer shows the same cues as Chrome between cue boundaries while seeking', async ({
  page,
}) => {
  for (const [seconds, expected] of SEEKS) {
    const { chromeCues, pageCues } = await seekAndReadCues(page, seconds);
    expect(chromeCues, `Chrome at ${String(seconds)}s`).toEqual(expected);
    expect(pageCues, `page at ${String(seconds)}s`).toEqual(expected);
  }
});

test('the page follows the video while it plays', async ({ page }) => {
  const activeCues = page.locator('#active-cues li');
  await expect(activeCues).toHaveCount(0);

  await page.evaluate(() => document.querySelector('video')?.play());
  await expect(activeCues).toHaveText(['Hello, this is the test page.']);
  await expect(activeCues).toHaveText(['Cues can touch end to end.']);
});

test('the overlay shows English on top and Portuguese below it', async ({ page }) => {
  await seekAndReadCues(page, 0.75);
  const english = page.locator('#player .english');
  const portuguese = page.locator('#player .portuguese');
  await expect(english).toHaveText('Hello, this is the test page.');
  await expect(portuguese).toHaveText('Olá, esta é a página de teste.');
  await expect(english).toHaveAttribute('lang', 'en');
  await expect(portuguese).toHaveAttribute('lang', 'pt-BR');

  const englishBox = await english.boundingBox();
  const portugueseBox = await portuguese.boundingBox();
  expect(portugueseBox?.y).toBeGreaterThanOrEqual((englishBox?.y ?? 0) + (englishBox?.height ?? 0));

  const [englishSize, portugueseSize] = await Promise.all(
    [english, portuguese].map((line) =>
      line.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize)),
    ),
  );
  expect(portugueseSize).toBeCloseTo((englishSize ?? 0) * 0.8, 1);
});

test('the overlay joins overlapping English cues above a single Portuguese cue', async ({
  page,
}) => {
  await seekAndReadCues(page, 5.5);
  await expect(page.locator('#player .english')).toHaveText(`${LONG_CUE}\nFirst overlap`);
  await expect(page.locator('#player .portuguese')).toHaveText(
    'Uma fala longa e duas curtas\ndentro dela.',
  );
});
