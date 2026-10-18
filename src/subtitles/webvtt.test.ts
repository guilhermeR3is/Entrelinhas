import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SubtitleFormatError } from './cue';
import { parseWebVtt } from './webvtt';

const PYTHON_ESCAPE = /\\(\n|\\|x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|[nrtfv])/g;
const ESCAPED_CHARACTERS: Record<string, string> = {
  '\n': '',
  '\\': '\\',
  n: '\n',
  r: '\r',
  t: '\t',
  f: '\f',
  v: '\v',
};

function readWpt(fileName: string): string {
  return readFileSync(new URL(`./fixtures/wpt/${fileName}`, import.meta.url), 'utf8');
}

function wptSource(testName: string): string {
  const test = readWpt(`${testName}.test`);
  const separator = '\n===\n';
  const escaped = test.slice(test.indexOf(separator) + separator.length);
  return escaped.replace(PYTHON_ESCAPE, (sequence: string, escape: string) =>
    escape.length > 1 && escape !== '\n'
      ? String.fromCharCode(parseInt(escape.slice(1), 16))
      : (ESCAPED_CHARACTERS[escape] ?? sequence),
  );
}

function textsOf(testName: string): string[] {
  return parseWebVtt(wptSource(testName), 'en').map((cue) => cue.text);
}

describe('parseWebVtt with the web-platform-tests suite', () => {
  it('accepts CR, LF and CRLF line endings in any mix', () => {
    expect(textsOf('newlines')).toEqual(['text0', 'text1', 'text2', 'text3']);
  });

  it('only treats "-->" as timings when the line parses as timings', () => {
    expect(textsOf('arrows')).toEqual(['text0', 'text1', 'text2', 'text3', 'text4', 'text5']);
  });

  it('keeps cue identifiers out of the cue text', () => {
    expect(textsOf('ids')).toEqual(['text0', 'text1', 'text2', 'text3', 'text4']);
  });

  it('ends the header at the first timings line even without a blank line', () => {
    expect(parseWebVtt(wptSource('header-timings'), 'en')).toEqual([
      { id: 0, startMs: 0, endMs: 1000, text: 'text', lang: 'en' },
    ]);
  });

  it('skips NOTE blocks but keeps NOTE written inside cue text', () => {
    expect(textsOf('comment-in-cue-text')).toEqual(['NOTE text', 'NOTE text\nNOTE text2']);
  });

  it('accepts timestamps without hours', () => {
    const cues = parseWebVtt(wptSource('timings-omitted-hours'), 'en');
    expect(cues.map(({ startMs, endMs }) => [startMs, endMs])).toEqual([
      [0, 1000],
      [0, 1000],
      [0, 1000],
    ]);
  });

  it('rejects 60 minutes or seconds but accepts 60 hours', () => {
    const cues = parseWebVtt(wptSource('timings-60'), 'en');
    expect(cues.map(({ text, startMs, endMs }) => [text, startMs, endMs])).toEqual([
      ['text1', 0, 216_001_000],
      ['text2', 216_000_000, 216_001_000],
    ]);
  });

  it('accepts hours with three digits and rejects other fields with the wrong length', () => {
    expect(textsOf('timings-too-long')).toEqual(['text0', 'text1']);
  });

  it('drops every cue whose timings contain garbage', () => {
    expect(textsOf('timings-garbage')).toEqual([]);
  });

  it('allows spaces, tabs and form feeds around timings, but not vertical tabs', () => {
    expect(textsOf('whitespace-chars')).toEqual(['   text0', 'text1', 'text2']);
  });

  it('replaces null characters and drops timings broken by them', () => {
    expect(textsOf('nulls')).toEqual([
      'text0',
      'text1',
      '\uFFFDtext\uFFFD2',
      'text3',
      'text4',
      'text5',
      'text6',
    ]);
  });

  it.each(['signature-bom', 'signature-space', 'signature-tab'])(
    'accepts the signature variant %s',
    (testName) => {
      expect(parseWebVtt(wptSource(testName), 'en')).toEqual([]);
    },
  );

  it.each([
    'signature-formfeed',
    'signature-lowercase',
    'signature-two-boms',
    'signature-websrt',
    'signature-missing',
    'signature-partial',
    'signature-missing-whitespace',
  ])('throws on the invalid signature %s', (testName) => {
    expect(() => parseWebVtt(readWpt(`${testName}.vtt`), 'en')).toThrow(SubtitleFormatError);
  });
});

describe('parseWebVtt cue text', () => {
  function textOf(payload: string): string | undefined {
    return parseWebVtt(`WEBVTT\n\n00:01.000 --> 00:02.000\n${payload}\n`, 'en')[0]?.text;
  }

  it('removes voice, class, style and timestamp tags', () => {
    expect(textOf('<v Roger>Hi <c.yellow>there</c>, <i>friend</i><00:01.500> again</v>')).toBe(
      'Hi there, friend again',
    );
  });

  it('decodes the common character references', () => {
    expect(textOf('Tom &amp; Jerry &lt;3 &gt; a&nbsp;b')).toBe('Tom & Jerry <3 > a\u00A0b');
    expect(textOf('&#233;t&#xE9; &#0;')).toBe('été \uFFFD');
  });

  it('keeps unknown references and stray ampersands as written', () => {
    expect(textOf('fish &chips; R&D')).toBe('fish &chips; R&D');
  });

  it('drops an unclosed tag up to the end of the cue', () => {
    expect(textOf('visible <i class')).toBe('visible ');
  });

  it('keeps line breaks between payload lines', () => {
    expect(textOf('first line\nsecond line')).toBe('first line\nsecond line');
  });
});

describe('parseWebVtt cue fields', () => {
  it('numbers cues in file order and tags them with the given language', () => {
    const source = 'WEBVTT\n\n00:05.000 --> 00:06.000\nlater\n\n00:01.000 --> 00:02.000\nearlier\n';
    expect(parseWebVtt(source, 'en-US')).toEqual([
      { id: 0, startMs: 5000, endMs: 6000, text: 'later', lang: 'en-US' },
      { id: 1, startMs: 1000, endMs: 2000, text: 'earlier', lang: 'en-US' },
    ]);
  });

  it('ignores cue settings, STYLE and REGION blocks', () => {
    const source = [
      'WEBVTT',
      '',
      'STYLE',
      '::cue { color: yellow }',
      '',
      'REGION',
      'id:bottom width:40%',
      '',
      '00:00:01.000 --> 00:00:02.500 line:0 align:start region:bottom',
      'Hello',
    ].join('\n');
    expect(parseWebVtt(source, 'en')).toEqual([
      { id: 0, startMs: 1000, endMs: 2500, text: 'Hello', lang: 'en' },
    ]);
  });
});
