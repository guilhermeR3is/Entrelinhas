import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { SubtitleFormatError } from './cue';
import { parseTtml } from './ttml';

beforeAll(() => {
  vi.stubGlobal('DOMParser', new JSDOM().window.DOMParser);
});

function readImsc(testName: string): string {
  return readFileSync(new URL(`./fixtures/imsc/${testName}.ttml`, import.meta.url), 'utf8');
}

function timesOf(testName: string): [number, number][] {
  return parseTtml(readImsc(testName), 'en').map(({ startMs, endMs }) => [startMs, endMs]);
}

function ttml(body: string, parameters = ''): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttp="http://www.w3.org/ns/ttml#parameter" ${parameters}>
  <body>${body}</body>
</tt>`;
}

function startOf(timeExpression: string, parameters = ''): number | undefined {
  return parseTtml(ttml(`<div><p begin="${timeExpression}">x</p></div>`, parameters), 'en')[0]
    ?.startMs;
}

function textOf(paragraph: string): string | undefined {
  return parseTtml(ttml(`<div>${paragraph}</div>`), 'en')[0]?.text;
}

const COUNTDOWN = [
  [0, 6000],
  [6000, 7000],
  [8000, 9000],
  [10_000, 11_000],
  [12_000, 13_000],
  [14_000, 15_000],
  [16_000, 17_000],
  [18_000, 19_000],
  [20_000, 25_000],
];

describe('parseTtml with the IMSC test suite', () => {
  it('reads begin in frames and dur in seconds', () => {
    expect(parseTtml(readImsc('BasicTiming001'), 'en')).toEqual([
      {
        id: 0,
        startMs: 10_000,
        endMs: 20_000,
        text: 'This text must appear at 10 seconds\nand be remain visible to 20 seconds.',
        lang: 'en',
      },
    ]);
    expect(timesOf('BasicTiming002')).toEqual([[10_000, 20_000]]);
  });

  it('drops a trailing line break and the whitespace after it', () => {
    const cues = parseTtml(readImsc('MediaParTiming001'), 'en');
    expect(cues.map((cue) => cue.text)).toEqual([
      'This text must appear at 10 seconds\nand be remain visible to 20 seconds,',
      'This text must appear at 5 seconds\nand be remain visible to 15 seconds,',
    ]);
    expect(cues.map(({ startMs, endMs }) => [startMs, endMs])).toEqual([
      [10_000, 20_000],
      [5000, 15_000],
    ]);
  });

  it('gives the same intervals for begin/end and begin/dur', () => {
    expect(timesOf('BeginEnd001')).toEqual(COUNTDOWN);
    expect(timesOf('BeginDur001')).toEqual(COUNTDOWN);
  });

  it('keeps paragraphs in document order when their times are shuffled', () => {
    const times = timesOf('BeginEnd003');
    expect(times[1]).toEqual([18_000, 19_000]);
    expect(times.toSorted(([a], [b]) => a - b)).toEqual(COUNTDOWN);
  });

  it('keeps paragraphs without an end active until the document ends', () => {
    const times = timesOf('BeginEnd002');
    expect(times).toHaveLength(12);
    expect(times[3]).toEqual([3000, Infinity]);
    expect(times.at(-1)).toEqual([11_000, 20_000]);
  });

  it('collapses the indentation around the text', () => {
    const cues = parseTtml(readImsc('FixedBeginEnd002'), 'en');
    expect(cues[7]?.text).toBe('This test counts from 0 to 10 in 10 seconds.\n7');
  });

  it.each(['BasicTiming003', 'MediaParTiming003'])(
    'rejects sequential time containers in %s',
    (testName) => {
      expect(() => parseTtml(readImsc(testName), 'en')).toThrow(/Sequential/);
    },
  );

  it.each(['BasicTiming010', 'BasicTimeContainment001'])(
    'rejects timed spans in %s',
    (testName) => {
      expect(() => parseTtml(readImsc(testName), 'en')).toThrow(/Timed TTML spans/);
    },
  );
});

describe('parseTtml time expressions', () => {
  it.each([
    ['1.2s', 1200],
    ['1.2m', 72_000],
    ['1.2h', 4_320_000],
    ['500ms', 500],
    ['01:02:03', 3_723_000],
    ['01:02:03.235', 3_723_235],
    ['01:02:03.2350', 3_723_235],
    ['100:00:00.1', 360_000_100],
  ])('reads %s as %i ms', (expression, milliseconds) => {
    expect(startOf(expression)).toBe(milliseconds);
  });

  it('applies the frame rate multiplier to frames', () => {
    const ntscFilm = 'ttp:frameRate="24" ttp:frameRateMultiplier="1000 1001"';
    expect(startOf('24f', ntscFilm)).toBe(1001);
    expect(startOf('01:02:03:20', ntscFilm)).toBe(3_723_834);
  });

  it('assumes 30 frames per second when no frame rate is declared', () => {
    expect(startOf('15f')).toBe(500);
  });

  it('reads sub-frames as fractions of a frame', () => {
    expect(startOf('00:00:01:12.1', 'ttp:frameRate="24" ttp:subFrameRate="2"')).toBe(1521);
  });

  it('reads ticks with the declared tick rate', () => {
    expect(startOf('15000000t', 'ttp:tickRate="10000000"')).toBe(1500);
  });

  it('derives the tick rate from the frame rate, or uses one tick per second', () => {
    expect(startOf('48t', 'ttp:frameRate="24" ttp:subFrameRate="2"')).toBe(1000);
    expect(startOf('2t')).toBe(2000);
  });

  it.each(['5x', '1:02:03', '00:60:00', '00:00:00,500', ' '])(
    'throws on the invalid expression "%s"',
    (expression) => {
      expect(() => startOf(expression)).toThrow(SubtitleFormatError);
    },
  );
});

describe('parseTtml time containment', () => {
  function intervalsOf(body: string): [number, number][] {
    return parseTtml(ttml(body), 'en').map(({ startMs, endMs }) => [startMs, endMs]);
  }

  it('offsets a paragraph by the begin of its division', () => {
    expect(intervalsOf('<div begin="10s"><p begin="2s" end="5s">x</p></div>')).toEqual([
      [12_000, 15_000],
    ]);
  });

  it('cuts a paragraph at the end of its division and drops paragraphs that start after it', () => {
    const body = '<div dur="3s"><p begin="1s" end="10s">x</p><p begin="4s" end="5s">y</p></div>';
    expect(intervalsOf(body)).toEqual([[1000, 3000]]);
  });

  it('uses the earlier of end and begin plus dur', () => {
    expect(intervalsOf('<div><p begin="1s" end="5s" dur="2s">x</p></div>')).toEqual([[1000, 3000]]);
  });
});

describe('parseTtml text', () => {
  it('collapses whitespace, joins spans and turns br into line breaks', () => {
    const paragraph = '<p end="1s">\n  Hello\n   <span>big</span>   world<br/>\n  again </p>';
    expect(textOf(paragraph)).toBe('Hello big world\nagain');
  });

  it('keeps whitespace as written under xml:space="preserve"', () => {
    expect(textOf('<p end="1s" xml:space="preserve">a  b</p>')).toBe('a  b');
  });

  it('ignores metadata and elements from other namespaces', () => {
    const paragraph =
      '<p end="1s">Hi<metadata><desc>note</desc></metadata><x:extra xmlns:x="urn:x">no</x:extra></p>';
    expect(textOf(paragraph)).toBe('Hi');
  });

  it('skips paragraphs without text and tags cues with the given language', () => {
    const cues = parseTtml(ttml('<div><p end="1s"> </p><p end="2s">Oi</p></div>'), 'pt-BR');
    expect(cues).toEqual([{ id: 0, startMs: 0, endMs: 2000, text: 'Oi', lang: 'pt-BR' }]);
  });
});

describe('parseTtml documents', () => {
  it('returns no cues for a document without a body', () => {
    expect(parseTtml('<tt xmlns="http://www.w3.org/ns/ttml"/>', 'en')).toEqual([]);
  });

  it.each([
    ['broken XML', '<tt xmlns="http://www.w3.org/ns/ttml"><body>'],
    ['XML that is not TTML', '<html><body><p>Hi</p></body></html>'],
    ['a WebVTT file', 'WEBVTT\n\n00:01.000 --> 00:02.000\nHi\n'],
    ['the SMPTE time base', ttml('', 'ttp:timeBase="smpte"')],
  ])('throws on %s', (_description, source) => {
    expect(() => parseTtml(source, 'en')).toThrow(SubtitleFormatError);
  });
});
