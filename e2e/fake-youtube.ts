import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';

const WATCH_PAGE = readFileSync(new URL('./fake-youtube/watch.html', import.meta.url), 'utf8');
const VIDEO = readFileSync(new URL('./test-page/clock.webm', import.meta.url));

const CAPTIONS: Record<string, [number, number, string][]> = {
  'video-a': [
    [0, 3000, 'First line of video A'],
    [3000, 600_000, 'Second line of video A'],
  ],
  'video-b': [[0, 600_000, 'Only line of video B']],
};

function json3Track(videoId: string): string {
  const events = (CAPTIONS[videoId] ?? []).map(([start, end, text]) => ({
    tStartMs: start,
    dDurationMs: end - start,
    segs: [{ utf8: text }],
  }));
  return JSON.stringify({ wireMagic: 'pb3', events });
}

export async function openFakeYouTube(page: Page, videoId: string): Promise<string[]> {
  const leakedRequests: string[] = [];
  await page.context().route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.protocol === 'chrome-extension:') return route.continue();
    if (url.hostname !== 'www.youtube.com') {
      leakedRequests.push(url.href);
      return route.abort();
    }
    switch (url.pathname) {
      case '/watch':
        return route.fulfill({ contentType: 'text/html', body: WATCH_PAGE });
      case '/clock.webm':
        return route.fulfill({ contentType: 'video/webm', body: VIDEO });
      case '/api/timedtext':
        return route.fulfill({
          contentType: 'application/json',
          body: json3Track(url.searchParams.get('v') ?? ''),
        });
      default:
        leakedRequests.push(url.href);
        return route.abort();
    }
  });
  await page.goto(`https://www.youtube.com/watch?v=${videoId}`);
  return leakedRequests;
}
