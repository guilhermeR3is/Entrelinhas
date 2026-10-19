import { describe, expect, it } from 'vitest';
import type { Cue } from '../subtitles/cue';
import { groupSentences } from './sentence-groups';

function cuesOf(...texts: string[]): Cue[] {
  return texts.map((text, index) => ({
    id: index,
    startMs: index * 1000,
    endMs: index * 1000 + 900,
    text,
    lang: 'en',
  }));
}

function textsOf(cues: readonly Cue[]): string[] {
  return cues.map((cue) => cue.text);
}

describe('groupSentences', () => {
  it('joins the pieces of a sentence and keeps its whole time span', () => {
    const sentences = groupSentences(
      cuesOf(
        'So I wrote a 90-page thesis',
        'and I spent the whole year',
        'procrastinating like a master.',
      ),
    );
    expect(sentences).toEqual([
      {
        id: 0,
        startMs: 0,
        endMs: 2900,
        text: 'So I wrote a 90-page thesis and I spent the whole year procrastinating like a master.',
        lang: 'en',
      },
    ]);
  });

  it('keeps a cue that is already a sentence as it is', () => {
    const sentences = groupSentences(cuesOf('Where are you going?', 'I really have no idea!'));
    expect(textsOf(sentences)).toEqual(['Where are you going?', 'I really have no idea!']);
    expect(sentences.map((sentence) => sentence.id)).toEqual([0, 1]);
  });

  it.each([
    ['a closing quote', 'He said "stop."'],
    ['a closing parenthesis', '(I mean it.)'],
    ['a curly quote', 'She asked “why?”'],
  ])('ends a sentence before %s', (_, text) => {
    expect(textsOf(groupSentences(cuesOf(text, 'Next one.')))).toEqual([text, 'Next one.']);
  });

  it.each([['...'], ['…']])('treats a trailing %s as a sentence that goes on', (ellipsis) => {
    const sentences = groupSentences(cuesOf(`I was thinking${ellipsis}`, 'maybe tomorrow.'));
    expect(textsOf(sentences)).toEqual([`I was thinking${ellipsis} maybe tomorrow.`]);
  });

  it('translates cue by cue when three cues pass without the end of a sentence', () => {
    const cues = cuesOf('one', 'two', 'three', 'four.');
    expect(textsOf(groupSentences(cues))).toEqual(['one', 'two', 'three', 'four.']);
  });

  it('translates automatic captions cue by cue, since they have no punctuation', () => {
    const cues = cuesOf('so today we are going', 'to talk about', 'how to learn english');
    expect(textsOf(groupSentences(cues))).toEqual(textsOf(cues));
  });

  it('keeps sound descriptions apart and does not join across them', () => {
    const cues = cuesOf('and then', '[music]', 'Hello there.', '♪ la la la ♪', '(laughs)');
    expect(textsOf(groupSentences(cues))).toEqual([
      'and then',
      '[music]',
      'Hello there.',
      '♪ la la la ♪',
      '(laughs)',
    ]);
  });

  it('keeps the last pieces when the track ends in the middle of a sentence', () => {
    expect(textsOf(groupSentences(cuesOf('The end.', 'to be', 'continued')))).toEqual([
      'The end.',
      'to be',
      'continued',
    ]);
  });

  it('ends at the latest cue when cues overlap', () => {
    const [sentence] = groupSentences([
      { id: 0, startMs: 0, endMs: 5000, text: 'Wait for', lang: 'en' },
      { id: 1, startMs: 1000, endMs: 2000, text: 'me.', lang: 'en' },
    ]);
    expect(sentence).toMatchObject({ startMs: 0, endMs: 5000, text: 'Wait for me.' });
  });

  it('trims the spaces and keeps the line breaks inside a cue', () => {
    expect(textsOf(groupSentences(cuesOf('  I know  ', 'you do.\nRight?')))).toEqual([
      'I know you do.\nRight?',
    ]);
  });

  it('returns nothing for an empty track', () => {
    expect(groupSentences([])).toEqual([]);
  });
});
