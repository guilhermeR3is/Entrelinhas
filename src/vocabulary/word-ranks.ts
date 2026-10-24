export type WordRanks = ReadonlyMap<string, number>;

export const HIGHLIGHT_LEVELS = [1000, 2000, 5000, 10000] as const;
export type HighlightLevel = (typeof HIGHLIGHT_LEVELS)[number];
export type HighlightSetting = HighlightLevel | 'off';

export interface WordToken {
  text: string;
  start: number;
  end: number;
  key: string;
  startsSentence: boolean;
}

const WORD = /[A-Za-z]+(?:['’][A-Za-z]+)*/g;
const SENTENCE_BREAK = /[.!?:;"“”\-–—♪[\]()]/;

export function parseWordRanks(list: string): WordRanks {
  const ranks = new Map<string, number>();
  for (const word of list.split('\n')) {
    if (word !== '' && !ranks.has(word)) ranks.set(word, ranks.size + 1);
  }
  return ranks;
}

export function wordsIn(line: string): WordToken[] {
  const tokens: WordToken[] = [];
  let previousEnd = 0;
  for (const match of line.matchAll(WORD)) {
    const text = match[0];
    const start = match.index;
    const between = line.slice(previousEnd, start);
    tokens.push({
      text,
      start,
      end: start + text.length,
      key: text.toLowerCase().replaceAll('’', "'"),
      startsSentence: tokens.length === 0 || SENTENCE_BREAK.test(between) || between.includes('\n'),
    });
    previousEnd = start + text.length;
  }
  return tokens;
}

export interface SentencePart {
  text: string;
  isWord: boolean;
}

export function splitAroundWord(sentence: string, word: string): SentencePart[] {
  const parts: SentencePart[] = [];
  let previousEnd = 0;
  for (const token of wordsIn(sentence)) {
    if (token.key !== word) continue;
    if (token.start > previousEnd) {
      parts.push({ text: sentence.slice(previousEnd, token.start), isWord: false });
    }
    parts.push({ text: token.text, isWord: true });
    previousEnd = token.end;
  }
  if (previousEnd < sentence.length) {
    parts.push({ text: sentence.slice(previousEnd), isWord: false });
  }
  return parts;
}

export function rankOf(ranks: WordRanks, key: string): number | undefined {
  const rank = ranks.get(key);
  if (rank !== undefined || !key.endsWith("'s")) return rank;
  return ranks.get(key.slice(0, -2));
}

export function isUncommon(ranks: WordRanks, token: WordToken, level: HighlightLevel): boolean {
  if (looksLikeName(token)) return false;
  const rank = rankOf(ranks, token.key);
  return rank === undefined || rank > level;
}

function looksLikeName(token: WordToken): boolean {
  const first = token.text.charAt(0);
  if (token.startsSentence || first === first.toLowerCase()) return false;
  return token.text !== token.text.toUpperCase() || token.text.length === 1;
}
