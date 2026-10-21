const SPEAKER_DASH = /^[-\u2013\u2014]/;

export function isDialogue(text: string): boolean {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
  return lines.length > 1 && lines.every((line) => SPEAKER_DASH.test(line));
}
