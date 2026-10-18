import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Cue } from './cue';
import { parseSrt } from './srt';
import { SubtitleTrack } from './subtitle-track';

function cue(id: number, startMs: number, endMs: number): Cue {
  return { id, startMs, endMs, text: `cue ${String(id)}`, lang: 'en' };
}

function idsAt(track: SubtitleTrack, timeMs: number): number[] {
  return track.activeAt(timeMs).map((active) => active.id);
}

function bruteForceIds(cues: readonly Cue[], timeMs: number): number[] {
  return cues
    .filter((candidate) => candidate.startMs <= timeMs && timeMs < candidate.endMs)
    .toSorted((a, b) => a.startMs - b.startMs)
    .map((active) => active.id);
}

function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 2 ** 32;
  };
}

describe('SubtitleTrack.activeAt', () => {
  const sequential = new SubtitleTrack([
    cue(0, 1000, 2000),
    cue(1, 2000, 3000),
    cue(2, 5000, 6000),
  ]);

  it('includes the start and excludes the end of a cue', () => {
    expect(idsAt(sequential, 999)).toEqual([]);
    expect(idsAt(sequential, 1000)).toEqual([0]);
    expect(idsAt(sequential, 1999)).toEqual([0]);
    expect(idsAt(sequential, 2000)).toEqual([1]);
  });

  it('returns no cue in a gap between cues and after the last one', () => {
    expect(idsAt(sequential, 4000)).toEqual([]);
    expect(idsAt(sequential, 6000)).toEqual([]);
    expect(idsAt(sequential, 1e9)).toEqual([]);
  });

  it('returns every overlapping cue, ordered by start', () => {
    const track = new SubtitleTrack([cue(0, 0, 5000), cue(1, 2000, 3000)]);
    expect(idsAt(track, 2500)).toEqual([0, 1]);
    expect(idsAt(track, 3000)).toEqual([0]);
  });

  it('keeps a long cue active across shorter ones that come and go', () => {
    const track = new SubtitleTrack([cue(0, 0, 10_000), cue(1, 1000, 2000), cue(2, 3000, 4000)]);
    expect(idsAt(track, 1500)).toEqual([0, 1]);
    expect(idsAt(track, 2500)).toEqual([0]);
    expect(idsAt(track, 3500)).toEqual([0, 2]);
  });

  it('sorts cues given out of order and keeps file order for equal starts', () => {
    const track = new SubtitleTrack([cue(0, 3000, 4000), cue(1, 1000, 5000), cue(2, 1000, 2000)]);
    expect(track.cues.map((sorted) => sorted.id)).toEqual([1, 2, 0]);
    expect(idsAt(track, 1500)).toEqual([1, 2]);
  });

  it('keeps cues without an end active forever', () => {
    const track = new SubtitleTrack([
      cue(0, 0, Infinity),
      cue(1, 1000, Infinity),
      cue(2, 2000, 3000),
    ]);
    expect(idsAt(track, 2500)).toEqual([0, 1, 2]);
    expect(idsAt(track, 1e12)).toEqual([0, 1]);
  });

  it('ignores cues that end before or when they start', () => {
    const track = new SubtitleTrack([cue(0, 2000, 2000), cue(1, 3000, 1000), cue(2, 0, 1000)]);
    expect(track.cues.map((kept) => kept.id)).toEqual([2]);
    expect(idsAt(track, 2000)).toEqual([]);
  });

  it('returns no cue for an empty track, negative times and NaN', () => {
    expect(idsAt(new SubtitleTrack([]), 0)).toEqual([]);
    expect(idsAt(sequential, -1)).toEqual([]);
    expect(idsAt(sequential, Number.NaN)).toEqual([]);
  });

  it('returns the same array while the active cues do not change', () => {
    const track = new SubtitleTrack([cue(0, 0, 5000), cue(1, 2000, 3000)]);
    expect(track.activeAt(2100)).toBe(track.activeAt(2900));
    expect(track.activeAt(2900)).not.toBe(track.activeAt(3100));
  });

  it('does not change the cues it receives', () => {
    const cues = [cue(0, 3000, 4000), cue(1, 1000, 2000)];
    const track = new SubtitleTrack(cues);
    expect(track.cues.map((sorted) => sorted.id)).toEqual([1, 0]);
    expect(cues.map((original) => original.id)).toEqual([0, 1]);
  });
});

describe('SubtitleTrack against a brute-force scan', () => {
  it('agrees on the Sintel subtitles, including the gaps between lines', () => {
    const cues = parseSrt(
      readFileSync(new URL('./fixtures/sintel/sintel_en.srt', import.meta.url), 'utf8'),
      'en',
    );
    const track = new SubtitleTrack(cues);
    for (let timeMs = 0; timeMs <= 640_000; timeMs += 50) {
      expect(idsAt(track, timeMs)).toEqual(bruteForceIds(cues, timeMs));
    }
    expect(idsAt(track, 111_000)).toEqual([]);
  });

  it('agrees on random overlapping cues while seeking back and forth', () => {
    const random = seededRandom(42);
    const cues = Array.from({ length: 300 }, (_, id) => {
      const startMs = Math.floor(random() * 600_000);
      return cue(id, startMs, startMs + Math.floor(random() * 20_000));
    });
    const track = new SubtitleTrack(cues);
    for (let seek = 0; seek < 2000; seek += 1) {
      const timeMs = Math.floor(random() * 650_000);
      expect(idsAt(track, timeMs)).toEqual(bruteForceIds(cues, timeMs));
    }
  });
});
