import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SubtitleFormatError } from './cue';
import {
  MAX_SUBTITLE_FILE_BYTES,
  SubtitleFileTooLargeError,
  readSubtitleFile,
} from './subtitle-file';

const SRT =
  "1\r\n00:00:01,000 --> 00:00:02,500\r\nIt's a café.\r\n\r\n2\r\n00:00:03,000 --> 00:00:04,000\r\n<i>Bye.</i>\r\n";
const VTT = 'WEBVTT\n\n00:01.000 --> 00:02.500\nHello &amp; welcome.\n';

function file(content: BlobPart): Blob {
  return new Blob([content]);
}

function texts(cues: { text: string }[]): string[] {
  return cues.map((cue) => cue.text);
}

describe('readSubtitleFile', () => {
  it('reads an SRT file as UTF-8', async () => {
    const cues = await readSubtitleFile(file(SRT), 'en');
    expect(texts(cues)).toEqual(["It's a café.", 'Bye.']);
    expect(cues[0]).toMatchObject({ startMs: 1000, endMs: 2500, lang: 'en' });
  });

  it('reads a WebVTT file by its signature, whatever the name', async () => {
    const cues = await readSubtitleFile(file(`\uFEFF${VTT}`), 'en');
    expect(texts(cues)).toEqual(['Hello & welcome.']);
  });

  it('falls back to Windows-1252 when the bytes are not UTF-8', async () => {
    const latin = Uint8Array.from('1\n00:00:01,000 --> 00:00:02,000\ncafé\n', (char) =>
      char.charCodeAt(0),
    );
    expect(texts(await readSubtitleFile(file(latin), 'en'))).toEqual(['café']);
  });

  it('reads UTF-16 files saved with a byte order mark', async () => {
    const units = Uint16Array.from(`${String.fromCharCode(0xfeff)}${SRT}`, (char) =>
      char.charCodeAt(0),
    );
    const bytes = new Uint8Array(units.buffer);
    expect(texts(await readSubtitleFile(file(bytes), 'en'))).toEqual(["It's a café.", 'Bye.']);
  });

  it('reads a real SRT fixture', async () => {
    const source = readFileSync(new URL('./fixtures/sintel/sintel_en.srt', import.meta.url));
    const cues = await readSubtitleFile(file(source), 'en');
    expect(cues.length).toBeGreaterThan(10);
  });

  it.each([
    ['an empty file', ''],
    ['a file without timings', 'just some notes\nand more notes\n'],
    ['a WebVTT file without cues', 'WEBVTT\n\nNOTE nothing here\n'],
    ['cues without text', '1\n00:00:01,000 --> 00:00:02,000\n\n2\n00:00:03,000 --> 00:00:04,000\n'],
    ['cues that end before they start', '1\n00:00:05,000 --> 00:00:02,000\nBackwards\n'],
  ])('rejects %s', async (_case, content) => {
    await expect(readSubtitleFile(file(content), 'en')).rejects.toThrow(SubtitleFormatError);
  });

  it('rejects a file larger than a subtitle could be without reading it', async () => {
    const huge = {
      size: MAX_SUBTITLE_FILE_BYTES + 1,
      arrayBuffer: () => Promise.reject(new Error('read')),
    };
    await expect(readSubtitleFile(huge as unknown as Blob, 'en')).rejects.toThrow(
      SubtitleFileTooLargeError,
    );
  });

  it('lets a read failure reach the caller', async () => {
    const broken = {
      size: 10,
      arrayBuffer: () => Promise.reject(new DOMException('gone', 'NotReadableError')),
    };
    await expect(readSubtitleFile(broken as unknown as Blob, 'en')).rejects.toThrow('gone');
  });
});
