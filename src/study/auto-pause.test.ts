import { beforeEach, describe, expect, it } from 'vitest';
import type { Cue } from '../subtitles/cue';
import { SubtitleTrack } from '../subtitles/subtitle-track';
import { AutoPause } from './auto-pause';

function cue(startMs: number, endMs: number, text: string): Cue {
  return { id: startMs, startMs, endMs, text, lang: 'en' };
}

const TRACK = new SubtitleTrack([
  cue(0, 2000, 'If you want to learn,'),
  cue(2000, 4000, 'start today.'),
  cue(5000, 6000, 'Okay?'),
]);

function playThrough(autoPause: AutoPause, track: SubtitleTrack, times: number[]): number[] {
  return times
    .map((timeMs) => autoPause.sentenceEndCrossed(track, timeMs))
    .filter((end): end is number => end !== null);
}

describe('AutoPause', () => {
  let autoPause: AutoPause;

  beforeEach(() => {
    autoPause = new AutoPause();
  });

  it('starts off and flips with toggle', () => {
    expect(autoPause.enabled).toBe(false);
    expect(autoPause.toggle()).toBe(true);
    expect(autoPause.toggle()).toBe(false);
  });

  it('stops at the end of each sentence, not at the end of each cue', () => {
    autoPause.toggle();
    expect(playThrough(autoPause, TRACK, [1900, 1990, 2010, 3990, 4005, 5990, 6016])).toEqual([
      4000, 6000,
    ]);
  });

  it('catches the end even when a frame lands right on it', () => {
    autoPause.toggle();
    expect(playThrough(autoPause, TRACK, [3990, 4000, 4016])).toEqual([4000]);
  });

  it('says nothing while switched off, then catches the next end once on', () => {
    expect(playThrough(autoPause, TRACK, [3990, 4010])).toEqual([]);
    autoPause.toggle();
    expect(playThrough(autoPause, TRACK, [5990, 6010])).toEqual([6000]);
  });

  it('ignores jumps backwards and far forwards, as seeks', () => {
    autoPause.toggle();
    expect(playThrough(autoPause, TRACK, [4100, 3900])).toEqual([]);
    expect(playThrough(autoPause, TRACK, [3900, 5500, 5990, 6010])).toEqual([6000]);
  });

  it('needs a frame before the end after a restart', () => {
    autoPause.toggle();
    autoPause.sentenceEndCrossed(TRACK, 3990);
    autoPause.restart();
    expect(playThrough(autoPause, TRACK, [4010])).toEqual([]);
  });

  it('follows a new track', () => {
    autoPause.toggle();
    const other = new SubtitleTrack([cue(0, 1000, 'Hi.')]);
    expect(playThrough(autoPause, other, [990, 1010])).toEqual([1000]);
  });

  describe('lines read from the screen', () => {
    it('stops when the line on screen changes or goes away', () => {
      autoPause.toggle();
      expect(autoPause.lineEnded('Hello')).toBe(false);
      expect(autoPause.lineEnded('Hello')).toBe(false);
      expect(autoPause.lineEnded('Hello there')).toBe(true);
      expect(autoPause.lineEnded('')).toBe(true);
      expect(autoPause.lineEnded('Again')).toBe(false);
    });

    it('keeps track of the line while switched off', () => {
      autoPause.lineEnded('Hello');
      autoPause.toggle();
      expect(autoPause.lineEnded('Hello')).toBe(false);
      expect(autoPause.lineEnded('Bye')).toBe(true);
    });
  });
});
