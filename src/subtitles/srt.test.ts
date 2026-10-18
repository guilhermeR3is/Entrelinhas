import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SubtitleFormatError } from './cue';
import { parseSrt } from './srt';

function textsOf(source: string): string[] {
  return parseSrt(source, 'en').map((cue) => cue.text);
}

describe('parseSrt with the Sintel subtitles', () => {
  const cues = parseSrt(
    readFileSync(new URL('./fixtures/sintel/sintel_en.srt', import.meta.url), 'utf8'),
    'en',
  );

  it('reads every cue even though the file starts with a blank line', () => {
    expect(cues).toHaveLength(26);
    expect(cues[0]).toEqual({
      id: 0,
      startMs: 107_250,
      endMs: 110_500,
      text: 'This blade has a dark past.',
      lang: 'en',
    });
  });

  it('keeps the line break of two-line cues', () => {
    expect(cues[2]?.text).toBe("You're a fool for traveling alone,\nso completely unprepared.");
  });

  it('reads the last cue up to the end of the file', () => {
    expect(cues.at(-1)).toEqual({
      id: 25,
      startMs: 626_200,
      endMs: 629_800,
      text: 'Scales...',
      lang: 'en',
    });
  });

  it('produces cues that end after they start, in increasing order', () => {
    expect(cues.every((cue) => cue.endMs > cue.startMs)).toBe(true);
    expect(cues.every((cue, i) => i === 0 || cue.startMs >= (cues[i - 1]?.endMs ?? 0))).toBe(true);
  });
});

describe('parseSrt with files found in the wild', () => {
  it('accepts a byte order mark and Windows line endings', () => {
    const source = '\uFEFF1\r\n00:00:01,000 --> 00:00:02,000\r\nHello\r\n\r\n';
    expect(parseSrt(source, 'en')).toEqual([
      { id: 0, startMs: 1000, endMs: 2000, text: 'Hello', lang: 'en' },
    ]);
  });

  it('accepts a dot as decimal separator and position coordinates after the timings', () => {
    const source = '1\n00:00:01.000 --> 00:00:02.000 X1:100 X2:200 Y1:10 Y2:20\nHello\n';
    expect(parseSrt(source, 'en')[0]).toMatchObject({ startMs: 1000, endMs: 2000 });
  });

  it('reads fractions with fewer than three digits as decimals', () => {
    const source = '1\n0:0:1,5 --> 00:00:02,25\nHello\n';
    expect(parseSrt(source, 'en')[0]).toMatchObject({ startMs: 1500, endMs: 2250 });
  });

  it('splits cues when the blank line between them is missing', () => {
    const source =
      '1\n00:00:01,000 --> 00:00:02,000\nHello\n2\n00:00:03,000 --> 00:00:04,000\nWorld\n';
    expect(textsOf(source)).toEqual(['Hello', 'World']);
  });

  it('keeps a number that is the whole cue text', () => {
    const source =
      '1\n00:00:01,000 --> 00:00:02,000\n1984\n\n2\n00:00:03,000 --> 00:00:04,000\nYes\n';
    expect(textsOf(source)).toEqual(['1984', 'Yes']);
  });

  it('treats lines with only spaces as blank and tolerates extra blank lines', () => {
    const source =
      '\n\n1\n00:00:01,000 --> 00:00:02,000\nHello  \n   \n\n\n2\n00:00:03,000 --> 00:00:04,000\nWorld';
    expect(textsOf(source)).toEqual(['Hello', 'World']);
  });

  it('removes formatting tags and position codes but keeps other angle brackets', () => {
    const source =
      '1\n00:00:01,000 --> 00:00:02,000\n{\\an8}<i>Hi</i> <font color="#ffff00">there</font>, <B>you</B>. I <3 u\n';
    expect(textsOf(source)).toEqual(['Hi there, you. I <3 u']);
  });

  it('skips a cue whose timings are out of range and keeps the next one', () => {
    const source =
      '1\n00:00:60,000 --> 00:01:01,000\nBroken\n\n2\n00:01:02,000 --> 00:01:03,000\nFine\n';
    expect(textsOf(source)).toEqual(['Fine']);
  });

  it('returns no cues for an empty file', () => {
    expect(parseSrt(' \n\n', 'en')).toEqual([]);
  });

  it('throws when the content has no SRT timings at all', () => {
    expect(() => parseSrt('<!doctype html><title>Not found</title>', 'en')).toThrow(
      SubtitleFormatError,
    );
    expect(() => parseSrt('WEBVTT\n\n00:01.000 --> 00:02.000\nHello\n', 'en')).toThrow(
      SubtitleFormatError,
    );
  });
});
