export type CueWord = { startMs: number; textEnd: number };

export type Cue = {
  id: number;
  startMs: number;
  endMs: number;
  text: string;
  lang: string;
  words?: readonly CueWord[];
};

export function spokenLength(cue: Cue, timeMs: number): number {
  if (!cue.words) return cue.text.length;
  let length = 0;
  for (const word of cue.words) {
    if (word.startMs > timeMs) break;
    length = word.textEnd;
  }
  return length;
}

export class SubtitleFormatError extends Error {
  override name = 'SubtitleFormatError';
}
