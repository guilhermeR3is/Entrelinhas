export type Cue = {
  id: number;
  startMs: number;
  endMs: number;
  text: string;
  lang: string;
};

export class SubtitleFormatError extends Error {
  override name = 'SubtitleFormatError';
}
