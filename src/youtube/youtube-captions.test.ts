import { describe, expect, it, vi } from 'vitest';
import { YouTubeCaptions } from './youtube-captions';

const TRACK_BODY = JSON.stringify({
  events: [
    { tStartMs: 1000, dDurationMs: 2000, segs: [{ utf8: 'Hello there' }] },
    { tStartMs: 4000, dDurationMs: 1000, segs: [{ utf8: 'Bye' }] },
  ],
});

function createPage(url = 'https://www.youtube.com/watch?v=video-a') {
  const page = { location: { href: url } as Location };
  const captions = new YouTubeCaptions(page);
  const send = (fields: Record<string, unknown>, source: unknown = page) => {
    captions.receive({
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
  return { captions, send, goTo };
}

function textsAt(captions: YouTubeCaptions, timeMs: number): string[] {
  return captions.activeCues(timeMs).map((cue) => cue.text);
}

describe('YouTubeCaptions with the track the player downloaded', () => {
  it('waits until a caption track arrives', () => {
    const { captions } = createPage();
    expect(captions.status()).toBe('waiting');
    expect(captions.activeCues(1500)).toEqual([]);
  });

  it('follows the video time with the full English track', () => {
    const { captions, send } = createPage();
    send({});
    expect(captions.status()).toBe('full-track');
    expect(textsAt(captions, 1500)).toEqual(['Hello there']);
    expect(textsAt(captions, 3500)).toEqual([]);
    expect(captions.activeCues(1500)).toBe(captions.activeCues(2500));
  });

  it.each([
    ['English from a region', { lang: 'en-GB' }],
    ['a track translated to English', { lang: 'pt', translatedTo: 'en' }],
  ])('accepts %s', (_, fields) => {
    const { captions, send } = createPage();
    send(fields);
    expect(captions.status()).toBe('full-track');
  });

  it('ignores messages from other windows and messages in another shape', () => {
    const { captions, send } = createPage();
    send({}, {});
    send({ source: 'someone-else' });
    send({ videoId: 42 });
    expect(captions.status()).toBe('waiting');
  });

  it('marks a track in another language and does not read the screen for it', () => {
    const { captions, send } = createPage();
    send({ lang: 'pt' });
    captions.showScreenText('Olá');
    expect(captions.status()).toBe('other-language');
    expect(captions.activeCues(1500)).toEqual([]);
  });

  it('treats a track without language as another language', () => {
    const { captions, send } = createPage();
    send({ lang: null });
    expect(captions.status()).toBe('other-language');
  });
});

describe('YouTubeCaptions with an official Portuguese track', () => {
  const PORTUGUESE_BODY = JSON.stringify({
    events: [{ tStartMs: 1200, dDurationMs: 1500, segs: [{ utf8: 'Olá' }] }],
  });

  it('keeps the English track and adds the Portuguese one the player downloaded later', () => {
    const { captions, send } = createPage();
    send({});
    send({ lang: 'pt-BR', body: PORTUGUESE_BODY });

    expect(captions.status()).toBe('full-track');
    expect(textsAt(captions, 1500)).toEqual(['Hello there']);
    expect(
      captions
        .officialPortugueseTrack()
        ?.activeAt(1500)
        .map((cue) => cue.text),
    ).toEqual(['Olá']);
  });

  it('also takes the Portuguese track when it arrives before the English one', () => {
    const { captions, send } = createPage();
    send({ lang: 'pt', body: PORTUGUESE_BODY });
    expect(captions.status()).toBe('other-language');

    send({});
    expect(captions.status()).toBe('full-track');
    expect(captions.officialPortugueseTrack()).not.toBeNull();
  });

  it('does not take a track YouTube translated by machine as official', () => {
    const { captions, send } = createPage();
    send({});
    send({ lang: 'en', translatedTo: 'pt', body: PORTUGUESE_BODY });
    expect(captions.officialPortugueseTrack()).toBeNull();
  });

  it('does not take the automatic Portuguese track as official', () => {
    const { captions, send } = createPage();
    send({});
    send({ lang: 'pt', kind: 'asr', body: PORTUGUESE_BODY });
    expect(captions.status()).toBe('full-track');
    expect(captions.officialPortugueseTrack()).toBeNull();
  });

  it('hands over the English track only for the current video', () => {
    const { captions, send, goTo } = createPage();
    send({});
    send({ lang: 'pt', body: PORTUGUESE_BODY });
    expect(captions.englishTrack()?.cues).toHaveLength(2);

    goTo('https://www.youtube.com/watch?v=video-b');
    expect(captions.englishTrack()).toBeNull();
    expect(captions.officialPortugueseTrack()).toBeNull();
  });
});

describe('YouTubeCaptions when the track cannot be used', () => {
  it('falls back to the text on screen when the English track is unreadable', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { captions, send } = createPage();
    send({ body: '' });
    expect(captions.status()).toBe('unreadable');

    captions.showScreenText('Hello there');
    expect(captions.status()).toBe('screen');
    expect(textsAt(captions, 99_000)).toEqual(['Hello there']);
  });

  it('reads the screen when no track was captured, and stops when the screen is empty', () => {
    const { captions } = createPage();
    captions.showScreenText('Hello there\nfriend');
    expect(captions.status()).toBe('screen');
    expect(captions.activeCues(0)).toBe(captions.activeCues(5000));

    captions.showScreenText('');
    expect(captions.status()).toBe('waiting');
  });

  it('prefers the full track over the screen', () => {
    const { captions, send } = createPage();
    captions.showScreenText('Something else');
    send({});
    expect(textsAt(captions, 1500)).toEqual(['Hello there']);
  });
});

describe('YouTubeCaptions when the video changes without reloading the page', () => {
  it('forgets the previous video and recovers it when coming back', () => {
    const { captions, send, goTo } = createPage();
    send({});
    captions.showScreenText('Hello there');

    goTo('https://www.youtube.com/watch?v=video-b');
    expect(captions.status()).toBe('waiting');
    expect(captions.activeCues(1500)).toEqual([]);

    goTo('https://www.youtube.com/watch?v=video-a&t=30s');
    expect(captions.status()).toBe('full-track');
  });

  it('shows nothing outside a watch page', () => {
    const { captions, send, goTo } = createPage();
    send({});
    goTo('https://www.youtube.com/');
    captions.showScreenText('Preview caption');
    expect(captions.status()).toBe('waiting');
  });
});
