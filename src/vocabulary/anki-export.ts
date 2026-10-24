import { formatVideoTime, isWebLink } from './video-moment';
import type { SavedWord } from './vocabulary-store';
import { splitAroundWord } from './word-ranks';

export const ANKI_FILE_NAME = 'vocabulario-projeto-bilingue.csv';

const HEADER = [
  '#separator:Comma',
  '#html:true',
  '#tags:projeto-bilingue',
  '#guid column:1',
  '#columns:GUID,Frente,Verso',
];

export function ankiCsv(words: readonly SavedWord[]): string {
  const rows = [...words]
    .sort((first, second) => first.word.localeCompare(second.word, 'en'))
    .map((saved) => [`projeto-bilingue:${saved.word}`, front(saved), back(saved)]);
  return [...HEADER, ...rows.map((row) => row.map(csvField).join(','))].join('\n') + '\n';
}

function front(saved: SavedWord): string {
  const sentence = withWordInBold(saved.sentence, saved.word);
  return sentence === ''
    ? `<b>${html(saved.shown)}</b>`
    : `<b>${html(saved.shown)}</b><br>${sentence}`;
}

function back(saved: SavedWord): string {
  const lines = [html(saved.translation ?? '')];
  if (saved.sentenceTranslation)
    lines.push(`<i>${lineBreaks(html(saved.sentenceTranslation))}</i>`);
  const moment = `${html(saved.videoTitle)} · ${formatVideoTime(saved.timeMs)}`;
  lines.push(
    isWebLink(saved.videoUrl)
      ? `<small><a href="${html(saved.videoUrl)}">${moment}</a></small>`
      : `<small>${moment}</small>`,
  );
  return lines.join('<br>');
}

function withWordInBold(sentence: string, word: string): string {
  const parts = splitAroundWord(sentence, word).map((part) =>
    part.isWord ? `<b>${html(part.text)}</b>` : html(part.text),
  );
  return lineBreaks(parts.join(''));
}

function html(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function lineBreaks(text: string): string {
  return text.replaceAll('\n', '<br>');
}

function csvField(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}
