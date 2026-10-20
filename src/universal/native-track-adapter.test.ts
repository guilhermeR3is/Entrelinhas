import { describe, expect, it, vi } from 'vitest';
import { NativeTrackAdapter } from './native-track-adapter';

type FakeCue = { startTime: number; endTime: number; text?: string };
type FakeTrack = {
  kind: string;
  language: string;
  label: string;
  mode: TextTrackMode;
  cues: FakeCue[] | null;
};

const HELLO_CUES: FakeCue[] = [
  { startTime: 1, endTime: 3, text: 'Hello there.' },
  { startTime: 4, endTime: 5, text: 'Bye.' },
];

function track(fields: Partial<FakeTrack> = {}): FakeTrack {
  return { kind: 'subtitles', language: 'en', label: '', mode: 'disabled', cues: null, ...fields };
}

function fakeVideo(tracks: FakeTrack[], failed: FakeTrack[] = []): HTMLVideoElement {
  const video = Object.assign(new EventTarget(), {
    currentSrc: 'https://example.com/lesson.mp4',
    textTracks: tracks,
    querySelectorAll: () => failed.map((failedTrack) => ({ track: failedTrack, readyState: 3 })),
  });
  return video as unknown as HTMLVideoElement;
}

function createAdapter(tracks: FakeTrack[], failed: FakeTrack[] = []) {
  return new NativeTrackAdapter(fakeVideo(tracks, failed));
}

function textsAt(adapter: NativeTrackAdapter, timeMs: number): string[] {
  return adapter.activeCues(timeMs).map((cue) => cue.text);
}

describe('NativeTrackAdapter choosing the track', () => {
  it('waits while the video has no subtitle track', () => {
    const adapter = createAdapter([track({ kind: 'metadata' })]);
    expect(adapter.status()).toBe('waiting');
    expect(adapter.activeCues(1500)).toEqual([]);
  });

  it('reports another language and leaves its tracks as the site set them', () => {
    const spanish = track({ language: 'es', mode: 'showing' });
    const adapter = createAdapter([spanish]);
    expect(adapter.status()).toBe('other-language');
    expect(spanish.mode).toBe('showing');
  });

  it('hides the English track so the browser loads it without drawing it', () => {
    const english = track();
    const adapter = createAdapter([english]);
    expect(adapter.status()).toBe('waiting');
    expect(english.mode).toBe('hidden');

    english.cues = HELLO_CUES;
    expect(adapter.status()).toBe('full-track');
    expect(textsAt(adapter, 1500)).toEqual(['Hello there.']);
    expect(textsAt(adapter, 3500)).toEqual([]);
  });

  it('turns off other subtitles the site was drawing and leaves metadata alone', () => {
    const english = track({ mode: 'showing', cues: HELLO_CUES });
    const spanish = track({ language: 'es', mode: 'showing' });
    const chapters = track({ kind: 'chapters', mode: 'showing' });
    createAdapter([english, spanish, chapters]).status();
    expect(english.mode).toBe('hidden');
    expect(spanish.mode).toBe('disabled');
    expect(chapters.mode).toBe('showing');
  });

  it.each([
    ['a region', { language: 'EN-us' }],
    ['only a label', { language: '', label: 'English (CC)' }],
  ])('recognizes English from %s', (_, fields) => {
    const adapter = createAdapter([track({ ...fields, cues: HELLO_CUES })]);
    expect(adapter.status()).toBe('full-track');
  });

  it('follows the English track the person picks in the site menu', () => {
    const plain = track({ label: 'English', cues: [{ startTime: 1, endTime: 3, text: 'Plain' }] });
    const sdh = track({ label: 'English SDH', cues: [{ startTime: 1, endTime: 3, text: 'SDH' }] });
    const adapter = createAdapter([plain, sdh]);
    expect(textsAt(adapter, 1500)).toEqual(['Plain']);

    sdh.mode = 'showing';
    expect(textsAt(adapter, 1500)).toEqual(['SDH']);
    expect(sdh.mode).toBe('hidden');
    expect(textsAt(adapter, 1500)).toEqual(['SDH']);
  });

  it('reports a track the browser could not load', () => {
    const english = track();
    expect(createAdapter([english], [english]).status()).toBe('unreadable');
  });
});

describe('NativeTrackAdapter reading the cues', () => {
  it('keeps the plain text of each cue and skips cues without text', () => {
    const adapter = createAdapter([
      track({
        cues: [
          { startTime: 1, endTime: 3, text: '<v Ana><i>Hi</i> &amp; bye</v>' },
          { startTime: 1, endTime: 3 },
        ],
      }),
    ]);
    expect(adapter.activeCues(1500)).toEqual([
      { id: 0, startMs: 1000, endMs: 3000, text: 'Hi & bye', lang: 'en' },
    ]);
  });

  it('reads cues again only when the site adds more', () => {
    const english = track({ cues: [...HELLO_CUES] });
    const adapter = createAdapter([english]);
    const first = adapter.englishTrack();
    expect(adapter.englishTrack()).toBe(first);

    english.cues?.push({ startTime: 6, endTime: 7, text: 'Later.' });
    expect(adapter.englishTrack()).not.toBe(first);
    expect(textsAt(adapter, 6500)).toEqual(['Later.']);
  });

  it('gives the official Portuguese track next to the English one', () => {
    const portuguese = track({
      language: 'pt-BR',
      cues: [{ startTime: 1, endTime: 3, text: 'Olá.' }],
    });
    const adapter = createAdapter([track({ cues: HELLO_CUES }), portuguese]);
    expect(portuguese.mode).toBe('disabled');
    expect(adapter.officialPortugueseTrack()?.activeAt(1500)).toEqual([
      { id: 0, startMs: 1000, endMs: 3000, text: 'Olá.', lang: 'pt-BR' },
    ]);
    expect(portuguese.mode).toBe('hidden');
  });

  it('finds Portuguese by its label and ignores it without English', () => {
    const portuguese = track({ language: '', label: 'Português', mode: 'showing', cues: [] });
    const adapter = createAdapter([portuguese]);
    expect(adapter.officialPortugueseTrack()).toBeNull();
    expect(portuguese.mode).toBe('showing');

    const withEnglish = createAdapter([track({ cues: HELLO_CUES }), portuguese]);
    withEnglish.status();
    expect(portuguese.mode).toBe('hidden');
  });
});

describe('NativeTrackAdapter as the player', () => {
  it('is the video itself, with no ads and the source as the video key', () => {
    const video = fakeVideo([]);
    const adapter = new NativeTrackAdapter(video);
    expect(adapter.player).toBe(video);
    expect(adapter.video()).toBe(video);
    expect(adapter.videoKey()).toBe('https://example.com/lesson.mp4');
    expect(adapter.isShowingAd()).toBe(false);
  });

  it('asks for a new drawing when a track finishes loading, until stopped', () => {
    const video = fakeVideo([]);
    const adapter = new NativeTrackAdapter(video);
    const onCaptionsChange = vi.fn();
    adapter.start({ onCaptionsChange, onControlsLift: vi.fn() });
    video.dispatchEvent(new Event('load'));
    expect(onCaptionsChange).toHaveBeenCalledTimes(1);

    adapter.stop();
    video.dispatchEvent(new Event('load'));
    expect(onCaptionsChange).toHaveBeenCalledTimes(1);
  });

  it('gives the site back the subtitles it was drawing when stopped', () => {
    const english = track({ mode: 'showing', cues: HELLO_CUES });
    const spanish = track({ language: 'es', mode: 'showing' });
    const portuguese = track({ language: 'pt', mode: 'disabled' });
    const adapter = createAdapter([english, spanish, portuguese]);
    adapter.status();
    expect([english.mode, spanish.mode, portuguese.mode]).toEqual(['hidden', 'disabled', 'hidden']);

    adapter.stop();
    expect([english.mode, spanish.mode, portuguese.mode]).toEqual([
      'showing',
      'showing',
      'disabled',
    ]);
  });

  it('hides the English track when the session hides the site captions', () => {
    const english = track({ mode: 'showing' });
    createAdapter([english]).hideSiteCaptions();
    expect(english.mode).toBe('hidden');
  });
});
