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
const PORTUGUESE_CAPTIONS: Record<string, [number, number, string][]> = {
  'video-a': [[0, 600_000, 'Legenda oficial do vídeo A']],
};

const WORD_TIMED_EVENTS = [
  {
    tStartMs: 0,
    dDurationMs: 10_000,
    segs: [
      { utf8: 'Then' },
      { utf8: " that's", tOffsetMs: 200 },
      { utf8: ' fine.', tOffsetMs: 400 },
      { utf8: ' I', tOffsetMs: 4000 },
      { utf8: ' abstain.', tOffsetMs: 4300 },
    ],
  },
];

function json3Track(videoId: string, lang: string | null): string {
  if (videoId === 'video-words')
    return JSON.stringify({ wireMagic: 'pb3', events: WORD_TIMED_EVENTS });
  const captions = lang?.startsWith('pt') ? PORTUGUESE_CAPTIONS : CAPTIONS;
  const events = (captions[videoId] ?? []).map(([start, end, text]) => ({
    tStartMs: start,
    dDurationMs: end - start,
    segs: [{ utf8: text }],
  }));
  return JSON.stringify({ wireMagic: 'pb3', events });
}

export async function openFakeYouTube(
  page: Page,
  videoId: string,
  fakeTranslator?: string,
): Promise<string[]> {
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
          body: json3Track(url.searchParams.get('v') ?? '', url.searchParams.get('lang')),
        });
      default:
        leakedRequests.push(url.href);
        return route.abort();
    }
  });
  const watchUrl = new URL('https://www.youtube.com/watch');
  watchUrl.searchParams.set('v', videoId);
  if (fakeTranslator) watchUrl.searchParams.set('fake-translator', fakeTranslator);
  await page.goto(watchUrl.href);
  return leakedRequests;
}
