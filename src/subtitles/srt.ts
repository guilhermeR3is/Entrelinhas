import { type Cue, SubtitleFormatError } from './cue';

const ARROW = '-->';
const TIMINGS = /^\s*([\d:,.]+)\s*-->\s*([\d:,.]+)/;
const TIMESTAMP = /^(\d+):(\d{1,2}):(\d{1,2})[,.](\d{1,3})$/;
const INDEX = /^\s*\d+\s*$/;
const FORMATTING = /<\/?(?:b|i|u|s|font)(?:\s[^>]*)?>|\{\\[^}]*\}/gi;

export function parseSrt(source: string, lang: string): Cue[] {
  const lines = source
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .split('\n');

  const cues: Cue[] = [];
  let pos = 0;
  while (pos < lines.length) {
    const timings = parseTimings(lines[pos] ?? '');
    pos += 1;
    if (!timings) continue;

    const textStart = pos;
    while (pos < lines.length && !endsCueText(lines, pos)) pos += 1;
    const text = toPlainText(lines.slice(textStart, pos));
    cues.push({ id: cues.length, ...timings, text, lang });
  }

  if (cues.length === 0 && source.trim() !== '') {
    throw new SubtitleFormatError('No SRT cue timings were found');
  }
  return cues;
}

function endsCueText(lines: string[], pos: number): boolean {
  const line = lines[pos] ?? '';
  const nextLine = lines[pos + 1] ?? '';
  return (
    line.trim() === '' || line.includes(ARROW) || (INDEX.test(line) && nextLine.includes(ARROW))
  );
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

  const [, hours = '', minutes = '', seconds = '', fraction = ''] = match;
  if (Number(minutes) > 59 || Number(seconds) > 59) return null;

  const milliseconds = Number(fraction.padEnd(3, '0'));
  return ((Number(hours) * 60 + Number(minutes)) * 60 + Number(seconds)) * 1000 + milliseconds;
}

function toPlainText(lines: string[]): string {
  return lines.map((line) => line.replace(FORMATTING, '').trim()).join('\n');
}
