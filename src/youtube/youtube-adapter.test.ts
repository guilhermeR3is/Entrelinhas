import { describe, expect, it, vi } from 'vitest';
import { YouTubeAdapter } from './youtube-adapter';

const TRACK_BODY = JSON.stringify({
  events: [
    { tStartMs: 1000, dDurationMs: 2000, segs: [{ utf8: 'Hello there' }] },
    { tStartMs: 4000, dDurationMs: 1000, segs: [{ utf8: 'Bye' }] },
  ],
});

function createPage(url = 'https://www.youtube.com/watch?v=video-a') {
  const page = { location: { href: url } as Location };
  const adapter = new YouTubeAdapter(page);
  const send = (fields: Record<string, unknown>, source: unknown = page) => {
    adapter.receive({
      source: source as MessageEventSource,
      data: {
        source: 'projeto-bilingue:caption-track',
        videoId: 'video-a',
        lang: 'en',
        kind: null,
        translatedTo: null,
        body: TRACK_BODY,
        ...fields,
      },
    });
  };
  const goTo = (nextUrl: string) => {
    page.location.href = nextUrl;
  };
  return { adapter, send, goTo };
}

function textsAt(adapter: YouTubeAdapter, timeMs: number): string[] {
  return adapter.activeCues(timeMs).map((cue) => cue.text);
}

describe('YouTubeAdapter with the track the player downloaded', () => {
  it('waits until a caption track arrives', () => {
    const { adapter } = createPage();
    expect(adapter.status()).toBe('waiting');
    expect(adapter.activeCues(1500)).toEqual([]);
  });

  it('follows the video time with the full English track', () => {
    const { adapter, send } = createPage();
    send({});
    expect(adapter.status()).toBe('full-track');
    expect(textsAt(adapter, 1500)).toEqual(['Hello there']);
    expect(textsAt(adapter, 3500)).toEqual([]);
    expect(adapter.activeCues(1500)).toBe(adapter.activeCues(2500));
  });

  it.each([
    ['English from a region', { lang: 'en-GB' }],
    ['a track translated to English', { lang: 'pt', translatedTo: 'en' }],
  ])('accepts %s', (_, fields) => {
    const { adapter, send } = createPage();
    send(fields);
    expect(adapter.status()).toBe('full-track');
  });

  it('ignores messages from other windows and messages in another shape', () => {
    const { adapter, send } = createPage();
    send({}, {});
    send({ source: 'someone-else' });
    send({ videoId: 42 });
    expect(adapter.status()).toBe('waiting');
  });

  it('marks a track in another language and does not read the screen for it', () => {
    const { adapter, send } = createPage();
    send({ lang: 'pt' });
    adapter.showScreenText('Olá');
    expect(adapter.status()).toBe('other-language');
    expect(adapter.activeCues(1500)).toEqual([]);
  });

  it('treats a track without language as another language', () => {
    const { adapter, send } = createPage();
    send({ lang: null });
    expect(adapter.status()).toBe('other-language');
  });
});

describe('YouTubeAdapter with an official Portuguese track', () => {
  const PORTUGUESE_BODY = JSON.stringify({
    events: [{ tStartMs: 1200, dDurationMs: 1500, segs: [{ utf8: 'Olá' }] }],
  });

  it('keeps the English track and adds the Portuguese one the player downloaded later', () => {
    const { adapter, send } = createPage();
    send({});
    send({ lang: 'pt-BR', body: PORTUGUESE_BODY });

    expect(adapter.status()).toBe('full-track');
    expect(textsAt(adapter, 1500)).toEqual(['Hello there']);
    expect(
      adapter
        .officialPortugueseTrack()
        ?.activeAt(1500)
        .map((cue) => cue.text),
    ).toEqual(['Olá']);
  });

  it('also takes the Portuguese track when it arrives before the English one', () => {
    const { adapter, send } = createPage();
    send({ lang: 'pt', body: PORTUGUESE_BODY });
    expect(adapter.status()).toBe('other-language');

    send({});
    expect(adapter.status()).toBe('full-track');
    expect(adapter.officialPortugueseTrack()).not.toBeNull();
  });

  it('does not take a track YouTube translated by machine as official', () => {
    const { adapter, send } = createPage();
    send({});
    send({ lang: 'en', translatedTo: 'pt', body: PORTUGUESE_BODY });
    expect(adapter.officialPortugueseTrack()).toBeNull();
  });

  it('hands over the English track only for the current video', () => {
    const { adapter, send, goTo } = createPage();
    send({});
    send({ lang: 'pt', body: PORTUGUESE_BODY });
    expect(adapter.englishTrack()?.cues).toHaveLength(2);

    goTo('https://www.youtube.com/watch?v=video-b');
    expect(adapter.englishTrack()).toBeNull();
    expect(adapter.officialPortugueseTrack()).toBeNull();
  });
});

describe('YouTubeAdapter when the track cannot be used', () => {
  it('falls back to the text on screen when the English track is unreadable', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { adapter, send } = createPage();
    send({ body: '' });
    expect(adapter.status()).toBe('unreadable');

    adapter.showScreenText('Hello there');
    expect(adapter.status()).toBe('screen');
    expect(textsAt(adapter, 99_000)).toEqual(['Hello there']);
  });

  it('reads the screen when no track was captured, and stops when the screen is empty', () => {
    const { adapter } = createPage();
    adapter.showScreenText('Hello there\nfriend');
    expect(adapter.status()).toBe('screen');
    expect(adapter.activeCues(0)).toBe(adapter.activeCues(5000));

    adapter.showScreenText('');
    expect(adapter.status()).toBe('waiting');
  });

  it('prefers the full track over the screen', () => {
    const { adapter, send } = createPage();
    adapter.showScreenText('Something else');
    send({});
    expect(textsAt(adapter, 1500)).toEqual(['Hello there']);
  });
});

describe('YouTubeAdapter when the video changes without reloading the page', () => {
  it('forgets the previous video and recovers it when coming back', () => {
    const { adapter, send, goTo } = createPage();
    send({});
    adapter.showScreenText('Hello there');

    goTo('https://www.youtube.com/watch?v=video-b');
    expect(adapter.status()).toBe('waiting');
    expect(adapter.activeCues(1500)).toEqual([]);

    goTo('https://www.youtube.com/watch?v=video-a&t=30s');
    expect(adapter.status()).toBe('full-track');
  });

  it('shows nothing outside a watch page', () => {
    const { adapter, send, goTo } = createPage();
    send({});
    goTo('https://www.youtube.com/');
    adapter.showScreenText('Preview caption');
    expect(adapter.status()).toBe('waiting');
  });
});
