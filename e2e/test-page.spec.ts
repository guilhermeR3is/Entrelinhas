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

test('Z and X change the speed in steps of 0.05 between 0.5 and 2', async ({ page }) => {
  const speed = () => page.evaluate(() => document.querySelector('video')?.playbackRate);
  await page.keyboard.press('x');
  await expect.poll(speed).toBe(1.05);
  for (let press = 0; press < 12; press += 1) await page.keyboard.press('z');
  await expect.poll(speed).toBe(0.5);
  for (let press = 0; press < 40; press += 1) await page.keyboard.press('x');
  await expect.poll(speed).toBe(2);
});

test('the study strip shows the speed and its buttons change it', async ({ page }) => {
  const strip = page.locator('.strip');
  await expect(strip).toBeVisible();
  await expect(strip.locator('.speed')).toHaveText('1x');
  await page.getByRole('button', { name: 'Mais devagar' }).click();
  await expect(strip.locator('.speed')).toHaveText('0,95x');
  expect(await page.evaluate(() => document.querySelector('video')?.playbackRate)).toBe(0.95);
});

test('pauses at the end of each sentence while "Pausar no fim" is on', async ({ page }) => {
  const video = () =>
    page.evaluate(() => {
      const element = document.querySelector('video');
      return { paused: element?.paused, timeMs: Math.round((element?.currentTime ?? 0) * 1000) };
    });
  const english = page.locator('.english');
  const button = page.getByRole('button', { name: 'Pausar no fim' });
  await page.keyboard.press('p');
  await expect(button).toHaveAttribute('aria-pressed', 'true');

  await page.evaluate(() => document.querySelector('video')?.play());
  await expect.poll(async () => (await video()).paused, { timeout: 5000 }).toBe(true);
  const firstStop = await video();
  expect(firstStop.timeMs).toBeGreaterThanOrEqual(2000);
  expect(firstStop.timeMs).toBeLessThan(2100);
  await expect(english).toHaveText('Hello, this is the test page.');

  await page.evaluate(() => document.querySelector('video')?.play());
  await expect.poll(async () => (await video()).paused, { timeout: 5000 }).toBe(true);
  const secondStop = await video();
  expect(secondStop.timeMs).toBeGreaterThanOrEqual(4100);
  expect(secondStop.timeMs).toBeLessThan(4200);
  await expect(english).toHaveText('Cues can touch end to end.');

  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  await page.evaluate(() => document.querySelector('video')?.play());
  await page.waitForTimeout(1500);
  expect((await video()).paused).toBe(false);
});

async function seekTo(page: Page, seconds: number): Promise<void> {
  await page.evaluate(async (time) => {
    const video = document.querySelector('video');
    if (!video) throw new Error('No video on the test page');
    const seeked = new Promise((resolve) => {
      video.addEventListener('seeked', resolve, { once: true });
    });
    video.currentTime = time;
    await seeked;
  }, seconds);
}

function playback(page: Page) {
  return page.evaluate(() => {
    const video = document.querySelector('video');
    return {
      timeMs: Math.round((video?.currentTime ?? 0) * 1000),
      paused: video?.paused,
      rate: video?.playbackRate,
    };
  });
}

test('R plays the sentence on screen again from its start', async ({ page }) => {
  await seekTo(page, 3);
  await expect(page.locator('.english')).toHaveText('Cues can touch end to end.');
  await page.keyboard.press('r');
  const after = await playback(page);
  expect(after.timeMs).toBeGreaterThanOrEqual(2000);
  expect(after.timeMs).toBeLessThan(2500);
  expect(after.paused).toBe(false);
});

test('Shift+R repeats the sentence at 0.75x and gives the speed back at its end', async ({
  page,
}) => {
  await seekTo(page, 3);
  await page.keyboard.press('Shift+R');
  expect((await playback(page)).rate).toBe(0.75);
  await expect(page.locator('.speed')).toHaveText('0,75x');
  await expect
    .poll(async () => (await playback(page)).timeMs, { timeout: 5000 })
    .toBeGreaterThan(4150);
  expect((await playback(page)).rate).toBe(1);
  await expect(page.locator('.speed')).toHaveText('1x');
});

test('B blurs the Portuguese, V and the mouse show it until the next sentence', async ({
  page,
}) => {
  const portuguese = page.locator('.portuguese');
  const filter = () => portuguese.evaluate((element) => getComputedStyle(element).filter);
  await page.mouse.move(5, 5);
  await seekTo(page, 3);
  await page.keyboard.press('b');
  await expect(page.getByRole('button', { name: 'Borrar português' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect.poll(filter).toContain('blur');

  await page.keyboard.press('v');
  await expect.poll(filter).toBe('none');
  await seekTo(page, 0.6);
  await expect.poll(filter).toContain('blur');

  await page.locator('.english').hover();
  await expect.poll(filter).toBe('none');
});

test('the caption box moves by its handle and the arrow keys, always inside the video', async ({
  page,
}) => {
  const place = async () => {
    const [box, player] = await Promise.all([
      page.locator('.box').boundingBox(),
      page.locator('#player').boundingBox(),
    ]);
    if (!box || !player) throw new Error('Missing caption box or player');
    return {
      left: box.x - player.x,
      top: box.y - player.y,
      bottom: player.y + player.height - (box.y + box.height),
    };
  };
  const handle = page.getByRole('button', { name: 'Mover a legenda' });
  const start = await handle.boundingBox();
  if (!start) throw new Error('Missing handle');

  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(0, 0, { steps: 8 });
  await page.mouse.up();
  expect(await place()).toMatchObject({ left: 0, top: 0 });

  await handle.focus();
  await page.keyboard.press('ArrowDown');
  expect((await place()).top).toBeCloseTo(13.5, 0);
  await page.keyboard.press('Enter');
  expect((await place()).bottom).toBeCloseTo(10.8, 0);
});
