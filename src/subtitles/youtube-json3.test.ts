import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SubtitleFormatError, spokenLength } from './cue';
import { SubtitleTrack } from './subtitle-track';
import { parseYouTubeJson3 } from './youtube-json3';

function readFixture(name: string): string {
  return readFileSync(new URL(`./fixtures/youtube/${name}`, import.meta.url), 'utf8');
}

function trackOf(events: unknown[]): string {
  return JSON.stringify({ wireMagic: 'pb3', events });
}

describe('parseYouTubeJson3 with an automatic track', () => {
  const cues = parseYouTubeJson3(readFixture('automatic.json'), 'en');

  it('joins the words of each line and skips the window and line break events', () => {
    expect(cues.map((cue) => cue.text)).toEqual([
      'so today we are going',
      'to bake a loaf of',
      'bread at home',
      "let's start",
    ]);
  });

  it('ends each line when the next one starts, so only one line is on screen', () => {
    expect(cues.map(({ startMs, endMs }) => [startMs, endMs])).toEqual([
      [160, 2410],
      [2410, 4390],
      [4390, 8600],
      [10_000, 12_000],
    ]);
  });

  it('never shows two lines at the same time', () => {
    const track = new SubtitleTrack(cues);
    for (let ms = 0; ms <= 12_000; ms += 10) {
      expect(track.activeAt(ms).length).toBeLessThanOrEqual(1);
    }
  });

  it('says each word at its own time', () => {
    const [first] = cues;
    if (!first) throw new Error('Missing cue');
    const saidAt = (ms: number) => first.text.slice(0, spokenLength(first, ms));
    expect(saidAt(160)).toBe('so');
    expect(saidAt(759)).toBe('so today');
    expect(saidAt(760)).toBe('so today we');
    expect(saidAt(Infinity)).toBe(first.text);
  });

  it('numbers the cues in order and tags them with the language', () => {
    expect(cues.map((cue) => cue.id)).toEqual([0, 1, 2, 3]);
    expect(cues.every((cue) => cue.lang === 'en')).toBe(true);
  });
});

describe('parseYouTubeJson3 with a styled track', () => {
  const cues = parseYouTubeJson3(readFixture('styled.json'), 'en');

  it('keeps one cue when the same line is drawn twice with different pens', () => {
    expect(
      cues.map(({ id, startMs, endMs, text, lang }) => ({ id, startMs, endMs, text, lang })),
    ).toEqual([
      { id: 0, startMs: 0, endMs: 3000, text: 'If you want\nto LEARN something,', lang: 'en' },
      { id: 1, startMs: 3080, endMs: 5200, text: 'start today.', lang: 'en' },
    ]);
  });

  it('keeps when each word is said, skipping the pieces without text', () => {
    expect(cues[0]?.words).toEqual([
      { startMs: 0, textEnd: 2 },
      { startMs: 200, textEnd: 6 },
      { startMs: 420, textEnd: 11 },
      { startMs: 902, textEnd: 14 },
      { startMs: 1200, textEnd: 20 },
      { startMs: 1500, textEnd: 31 },
    ]);
  });
});

describe('parseYouTubeJson3 with a plain track', () => {
  const cues = parseYouTubeJson3(readFixture('plain.json'), 'en');

  it('keeps the original timings, including lines that overlap', () => {
    expect(cues.map(({ startMs, endMs, text }) => [startMs, endMs, text])).toEqual([
      [1000, 4000, 'Where are you going?'],
      [2500, 5000, "I don't know.\nMaybe home."],
      [6000, 7500, '[music]'],
    ]);
  });
});

describe('parseYouTubeJson3 with unusual events', () => {
  it('skips events without text or without a positive duration', () => {
    const source = trackOf([
      { tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: '  ' }, { utf8: '\n' }] },
      { tStartMs: 1000, segs: [{ utf8: 'no duration' }] },
      { tStartMs: 2000, dDurationMs: 0, segs: [{ utf8: 'zero duration' }] },
      { tStartMs: 3000, dDurationMs: 1000, segs: [{}, { utf8: 'kept' }] },
    ]);
    expect(parseYouTubeJson3(source, 'en').map((cue) => cue.text)).toEqual(['kept']);
  });

  it('keeps a duplicated line when its timing differs', () => {
    const source = trackOf([
      { tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: 'Hey!' }] },
      { tStartMs: 2000, dDurationMs: 1000, segs: [{ utf8: 'Hey!' }] },
    ]);
    expect(parseYouTubeJson3(source, 'en')).toHaveLength(2);
  });

  it('does not shorten lines of an automatic track that start together', () => {
    const source = trackOf([
      { tStartMs: 0, dDurationMs: 2000, segs: [{ utf8: 'one' }] },
      { tStartMs: 0, dDurationMs: 3000, segs: [{ utf8: 'two' }] },
      { tStartMs: 2500, dDurationMs: 100, aAppend: 1, segs: [{ utf8: '\n' }] },
    ]);
    expect(parseYouTubeJson3(source, 'en').map((cue) => cue.endMs)).toEqual([2000, 3000]);
  });

  it('returns no cues for a track without events', () => {
    expect(parseYouTubeJson3(trackOf([]), 'en')).toEqual([]);
  });
});

describe('parseYouTubeJson3 with something that is not a json3 track', () => {
  it.each([
    ['an empty response', ''],
    ['an HTML page', '<!doctype html><html></html>'],
    ['JSON without events', '{"wireMagic":"pb3"}'],
    ['events with the wrong types', trackOf([{ tStartMs: '0', segs: [{ utf8: 'Hi' }] }])],
  ])('throws a SubtitleFormatError for %s', (_, source) => {
    expect(() => parseYouTubeJson3(source, 'en')).toThrow(SubtitleFormatError);
  });
});
