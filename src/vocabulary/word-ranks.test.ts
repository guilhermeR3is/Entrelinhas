import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  isUncommon,
  parseWordRanks,
  rankOf,
  splitAroundWord,
  type WordToken,
  wordsIn,
} from './word-ranks';

const RANKS = parseWordRanks(['the', 'you', "don't", 'know', 'woman', 'run'].join('\n') + '\n');

function uncommonWords(line: string, level: 1000 | 2000 | 5000 | 10000 = 1000) {
  return wordsIn(line)
    .filter((token) => isUncommon(RANKS, token, level))
    .map((token) => token.text);
}

describe('parseWordRanks', () => {
  it('ranks words by their line, starting at 1', () => {
    expect(RANKS.get('the')).toBe(1);
    expect(RANKS.get('run')).toBe(6);
    expect(RANKS.size).toBe(6);
  });

  it('keeps the first rank of a repeated word and ignores empty lines', () => {
    const ranks = parseWordRanks('a\n\nb\na\n');
    expect([...ranks]).toEqual([
      ['a', 1],
      ['b', 2],
    ]);
  });
});

describe('wordsIn', () => {
  it('finds words with their position in the line', () => {
    expect(wordsIn('Run, you fool!')).toEqual([
      { text: 'Run', start: 0, end: 3, key: 'run', startsSentence: true },
      { text: 'you', start: 5, end: 8, key: 'you', startsSentence: false },
      { text: 'fool', start: 9, end: 13, key: 'fool', startsSentence: false },
    ]);
  });

  it('keeps contractions together and turns the curly apostrophe into a straight one', () => {
    expect(wordsIn('I don’t know')[1]).toMatchObject({ text: 'don’t', key: "don't" });
  });

  it('splits hyphenated words and leaves numbers out', () => {
    expect(wordsIn('a well-known 42nd street').map((token) => token.text)).toEqual([
      'a',
      'well',
      'known',
      'nd',
      'street',
    ]);
  });

  it('marks the first word after a full stop, a dash or a line break as a sentence start', () => {
    const starts = wordsIn('Stop. Now\n- Where? Here')
      .filter((token) => token.startsSentence)
      .map((token) => token.text);
    expect(starts).toEqual(['Stop', 'Now', 'Where', 'Here']);
  });
});

describe('splitAroundWord', () => {
  it('cuts the sentence around every place the word appears', () => {
    expect(splitAroundWord('Run! You run, I run.', 'run')).toEqual([
      { text: 'Run', isWord: true },
      { text: '! You ', isWord: false },
      { text: 'run', isWord: true },
      { text: ', I ', isWord: false },
      { text: 'run', isWord: true },
      { text: '.', isWord: false },
    ]);
  });

  it('keeps the whole sentence when the word is not there', () => {
    expect(splitAroundWord('Running late', 'run')).toEqual([
      { text: 'Running late', isWord: false },
    ]);
    expect(splitAroundWord('', 'run')).toEqual([]);
  });
});

describe('rankOf', () => {
  it('falls back to the word without the possessive ending', () => {
    expect(rankOf(RANKS, "woman's")).toBe(5);
    expect(rankOf(RANKS, "nobody's")).toBeUndefined();
  });
});

describe('isUncommon', () => {
  it('marks words past the level and words missing from the list', () => {
    expect(uncommonWords('You know the zeitgeist')).toEqual(['zeitgeist']);
  });

  it('compares the rank with the chosen level', () => {
    const ranks = new Map([
      ['run', 1500],
      ['fast', 800],
    ]);
    const [run, fast] = wordsIn('run fast') as [WordToken, WordToken];
    expect(isUncommon(ranks, run, 1000)).toBe(true);
    expect(isUncommon(ranks, run, 2000)).toBe(false);
    expect(isUncommon(ranks, fast, 1000)).toBe(false);
  });

  it('leaves capitalized words in the middle of a sentence alone, since they are usually names', () => {
    expect(uncommonWords('You know Douglas')).toEqual([]);
    expect(uncommonWords('Douglas knows you')).toEqual(['Douglas', 'knows']);
  });

  it('still checks words shouted in capitals', () => {
    expect(uncommonWords('you know the ZEITGEIST')).toEqual(['ZEITGEIST']);
  });
});

describe('word-ranks.txt', () => {
  const list = readFileSync(new URL('../../public/word-ranks.txt', import.meta.url), 'utf8');
  const ranks = parseWordRanks(list);

  it('has 25,000 lowercase words, one per line, without repeats', () => {
    const lines = list.trimEnd().split('\n');
    expect(lines).toHaveLength(25_000);
    expect(ranks.size).toBe(25_000);
    expect(lines.every((word) => /^[a-z]+(?:'[a-z]+)*$/.test(word))).toBe(true);
  });

  it('puts everyday words before rare ones', () => {
    expect(rankOf(ranks, 'the')).toBe(1);
    expect(rankOf(ranks, "don't")).toBeLessThan(1000);
    expect(rankOf(ranks, 'house')).toBeLessThan(2000);
    expect(rankOf(ranks, 'zeitgeist') ?? Infinity).toBeGreaterThan(10_000);
  });
});
