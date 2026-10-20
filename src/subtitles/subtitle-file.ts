import { type Cue, SubtitleFormatError } from './cue';
import { parseSrt } from './srt';
import { parseWebVtt } from './webvtt';

export const MAX_SUBTITLE_FILE_BYTES = 5 * 1024 * 1024;

const WEBVTT_START = /^\uFEFF?WEBVTT/;
const UTF16_BOMS: [number, number, string][] = [
  [0xff, 0xfe, 'utf-16le'],
  [0xfe, 0xff, 'utf-16be'],
];

export class SubtitleFileTooLargeError extends Error {
  override name = 'SubtitleFileTooLargeError';
}

export async function readSubtitleFile(file: Blob, lang: string): Promise<Cue[]> {
  if (file.size > MAX_SUBTITLE_FILE_BYTES) {
    throw new SubtitleFileTooLargeError(`The file has ${String(file.size)} bytes`);
  }
  const source = decode(new Uint8Array(await file.arrayBuffer()));
  const cues = WEBVTT_START.test(source) ? parseWebVtt(source, lang) : parseSrt(source, lang);
  if (!cues.some((cue) => cue.endMs > cue.startMs && cue.text.trim() !== '')) {
    throw new SubtitleFormatError('The file has no cue with text');
  }
  return cues;
}

function decode(bytes: Uint8Array): string {
  const [first, second] = bytes;
  const utf16 = UTF16_BOMS.find(([a, b]) => first === a && second === b);
  if (utf16) return new TextDecoder(utf16[2]).decode(bytes);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    return new TextDecoder('windows-1252').decode(bytes);
  }
}
