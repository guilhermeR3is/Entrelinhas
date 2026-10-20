import { type Cue, SubtitleFormatError } from './cue';

const ARROW = '-->';
const SIGNATURE = /^WEBVTT(?:[ \t]|$)/;
const TIMINGS = /^[ \t\f]*(\d+:\d+(?::\d+)?\.\d+)[ \t\f]*-->[ \t\f]*(\d+:\d+(?::\d+)?\.\d+)/;
const TIMESTAMP = /^(\d+):(\d+)(?::(\d+))?\.(\d+)$/;
const TAG = /<[^>]*(?:>|$)/g;
const CHARACTER_REFERENCE = /&(#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g;
const NAMED_REFERENCES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  nbsp: '\u00A0',
  lrm: '\u200E',
  rlm: '\u200F',
};

export function parseWebVtt(source: string, lang: string): Cue[] {
  const lines = source
    .replace(/^\uFEFF/, '')
    .replaceAll('\0', '\uFFFD')
    .replace(/\r\n?/g, '\n')
    .split('\n');

  if (!SIGNATURE.test(lines[0] ?? '')) {
    throw new SubtitleFormatError('The file does not start with the WEBVTT signature');
  }

  const cues: Cue[] = [];
  let pos = blockEnd(lines, 1);
  while (pos < lines.length) {
    const [first = '', second = ''] = lines.slice(pos, pos + 2);
    if (first === '') {
      pos += 1;
      continue;
    }

    const identifierLines = first.includes(ARROW) ? 0 : second.includes(ARROW) ? 1 : null;
    if (identifierLines === null) {
      pos = blockEnd(lines, pos + 1);
      continue;
    }

    const timings = parseTimings(identifierLines === 0 ? first : second);
    const textStart = pos + identifierLines + 1;
    pos = blockEnd(lines, textStart);
    if (timings) {
      const text = toPlainText(lines.slice(textStart, pos).join('\n'));
      cues.push({ id: cues.length, ...timings, text, lang });
    }
  }
  return cues;
}

function blockEnd(lines: string[], from: number): number {
  const end = lines.findIndex((line, i) => i >= from && (line === '' || line.includes(ARROW)));
  return end === -1 ? lines.length : end;
}

function parseTimings(line: string): { startMs: number; endMs: number } | null {
  const [, start = '', end = ''] = TIMINGS.exec(line) ?? [];
  const startMs = parseTimestamp(start);
  const endMs = parseTimestamp(end);
  return startMs === null || endMs === null ? null : { startMs, endMs };
}

function parseTimestamp(timestamp: string): number | null {
  const match = TIMESTAMP.exec(timestamp);
  if (!match) return null;

  const [, first = '', second = '', third, fraction = ''] = match;
  if (third === undefined && first.length !== 2) return null;
  const [hours, minutes, seconds] =
    third === undefined ? ['0', first, second] : [first, second, third];
  if (minutes.length !== 2 || seconds.length !== 2 || fraction.length !== 3) return null;
  if (Number(minutes) > 59 || Number(seconds) > 59) return null;

  return ((Number(hours) * 60 + Number(minutes)) * 60 + Number(seconds)) * 1000 + Number(fraction);
}

export function toPlainText(cueText: string): string {
  return cueText.replace(TAG, '').replace(CHARACTER_REFERENCE, decodeReference);
}

function decodeReference(reference: string, name: string): string {
  if (!name.startsWith('#')) return NAMED_REFERENCES[name] ?? reference;

  const codePoint = /^#[xX]/.test(name) ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
  const isValid =
    codePoint > 0 && codePoint <= 0x10ffff && !(codePoint >= 0xd800 && codePoint <= 0xdfff);
  return isValid ? String.fromCodePoint(codePoint) : '\uFFFD';
}
