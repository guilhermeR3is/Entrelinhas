import { describe, expect, it, vi } from 'vitest';
import type { Cue } from '../subtitles/cue';
import { FileTrackAdapter, MAX_DELAY_MS } from './file-track-adapter';

type FakeTrack = { mode: TextTrackMode };

const DELAY_STEP_MS = 100;
const FILE_CUES: Cue[] = [
  { id: 0, startMs: 1000, endMs: 3000, text: 'Hello there.', lang: 'en' },
  { id: 1, startMs: 4000, endMs: 5000, text: 'Bye.', lang: 'en' },
];

function fakeVideo(tracks: FakeTrack[] = []): HTMLVideoElement {
  const video = Object.assign(new EventTarget(), {
    currentSrc: 'blob:https://example.com/7f3a',
    textTracks: tracks,
  });
  return video as unknown as HTMLVideoElement;
}

function startedAdapter(tracks: FakeTrack[] = []) {
  const adapter = new FileTrackAdapter(fakeVideo(tracks), FILE_CUES);
  const onCaptionsChange = vi.fn();
  adapter.start({ onCaptionsChange, onControlsLift: vi.fn(), onFailure: vi.fn() });
  return { adapter, onCaptionsChange };
}

function textsAt(adapter: FileTrackAdapter, timeMs: number): string[] {
  return adapter.activeCues(timeMs).map((cue) => cue.text);
}

describe('FileTrackAdapter', () => {
  it('reads the whole file as the English track from the start', () => {
    const { adapter } = startedAdapter();
    expect(adapter.status()).toBe('full-track');
    expect(adapter.officialPortugueseTrack()).toBeNull();
    expect(adapter.englishTrack().cues).toHaveLength(2);
    expect(textsAt(adapter, 1500)).toEqual(['Hello there.']);
    expect(textsAt(adapter, 3500)).toEqual([]);
  });

  it('keeps the same track while the delay does not change', () => {
    const { adapter } = startedAdapter();
    expect(adapter.englishTrack()).toBe(adapter.englishTrack());
  });

  it('shows the captions later with a positive delay and earlier with a negative one', () => {
    const { adapter, onCaptionsChange } = startedAdapter();
    for (let step = 0; step < 3; step += 1) adapter.shiftDelay(DELAY_STEP_MS);
    expect(adapter.delayMs).toBe(300);
    expect(textsAt(adapter, 1200)).toEqual([]);
    expect(textsAt(adapter, 1300)).toEqual(['Hello there.']);
    expect(adapter.englishTrack().cues[1]).toMatchObject({ startMs: 4300, endMs: 5300 });
    expect(onCaptionsChange).toHaveBeenCalledTimes(3);

    adapter.shiftDelay(-800);
    expect(adapter.delayMs).toBe(-500);
    expect(textsAt(adapter, 500)).toEqual(['Hello there.']);
  });

  it('stops at the delay limit without redrawing', () => {
    const { adapter, onCaptionsChange } = startedAdapter();
    expect(adapter.shiftDelay(MAX_DELAY_MS + 5000)).toBe(MAX_DELAY_MS);
    const track = adapter.englishTrack();
    expect(adapter.shiftDelay(DELAY_STEP_MS)).toBe(MAX_DELAY_MS);
    expect(adapter.englishTrack()).toBe(track);
    expect(onCaptionsChange).toHaveBeenCalledTimes(1);
    expect(adapter.shiftDelay(-3 * MAX_DELAY_MS)).toBe(-MAX_DELAY_MS);
  });

  it('hides the captions the site was drawing and gives them back when it stops', () => {
    const showing: FakeTrack = { mode: 'showing' };
    const hidden: FakeTrack = { mode: 'hidden' };
    const { adapter } = startedAdapter([showing, hidden]);
    adapter.hideSiteCaptions(false);
    expect(showing.mode).toBe('showing');

    adapter.hideSiteCaptions(true);
    adapter.hideSiteCaptions(true);
    expect(showing.mode).toBe('hidden');

    adapter.stop();
    expect(showing.mode).toBe('showing');
    expect(hidden.mode).toBe('hidden');
  });

  it('does not redraw a stopped session when the delay changes', () => {
    const { adapter, onCaptionsChange } = startedAdapter();
    adapter.stop();
    adapter.shiftDelay(DELAY_STEP_MS);
    expect(onCaptionsChange).not.toHaveBeenCalled();
  });
});
