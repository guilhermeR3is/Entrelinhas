import { describe, expect, it } from 'vitest';
import type { SavedWord } from '../../vocabulary/vocabulary-store';
import {
  byLetter,
  countsText,
  dueText,
  nextReviewText,
  rememberedLabel,
  reviewQueue,
} from './review-text';

const NOW = new Date(2026, 9, 23, 20, 30).getTime();
const midnightIn = (days: number) => new Date(2026, 9, 23 + days).getTime();

function saved(word: string, dueAt: number, box = 0): SavedWord {
  return {
    word,
    shown: word,
    translation: null,
    sentence: '',
    sentenceTranslation: null,
    videoTitle: '',
    videoUrl: '',
    timeMs: 0,
    savedAt: 0,
    box,
    dueAt,
    reviews: 0,
  };
}

describe('review texts', () => {
  it('tells when a word comes back', () => {
    expect(dueText(saved('a', NOW - 1), NOW)).toBe('volta hoje');
    expect(dueText(saved('a', midnightIn(1)), NOW)).toBe('volta amanhã');
    expect(dueText(saved('a', midnightIn(14)), NOW)).toBe('volta em 14 dias');
  });

  it('puts the next interval on the button, so the person knows what remembering does', () => {
    expect(rememberedLabel({ box: 0 })).toBe('Lembrei · volta amanhã');
    expect(rememberedLabel({ box: 1 })).toBe('Lembrei · volta em 3 dias');
    expect(rememberedLabel({ box: 5 })).toBe('Lembrei · volta em 60 dias');
  });

  it('counts the words for today and the saved ones, in singular and plural', () => {
    expect(countsText([saved('a', NOW)], NOW)).toBe('1 palavra para revisar hoje. 1 salva.');
    const many = Array.from({ length: 1200 }, (_, index) =>
      saved(`w${String(index)}`, index < 3 ? NOW : midnightIn(1)),
    );
    expect(countsText(many, NOW)).toBe('3 palavras para revisar hoje. 1.200 salvas.');
    expect(countsText([saved('a', midnightIn(1))], NOW)).toBe('Nada para revisar hoje. 1 salva.');
  });

  it('says when the next review is', () => {
    const later = [saved('a', midnightIn(3)), saved('b', midnightIn(1))];
    expect(nextReviewText(later, NOW)).toBe('Nenhuma palavra para hoje. A próxima volta amanhã.');
    expect(nextReviewText([saved('a', midnightIn(7))], NOW)).toBe(
      'Nenhuma palavra para hoje. A próxima volta em 7 dias.',
    );
  });

  it('reviews the words that waited the longest first and leaves the others out', () => {
    const queue = reviewQueue(
      [saved('new', NOW), saved('old', NOW - 5000), saved('later', midnightIn(1))],
      NOW,
    );
    expect(queue.map((word) => word.word)).toEqual(['old', 'new']);
  });

  it('groups the saved words under their first letter, in alphabetical order', () => {
    const groups = byLetter([saved('zeitgeist', 0), saved('apple', 0), saved("aren't", 0)]);
    expect(groups.map(([letter, list]) => [letter, list.map((word) => word.word)])).toEqual([
      ['A', ['apple', "aren't"]],
      ['Z', ['zeitgeist']],
    ]);
  });
});
