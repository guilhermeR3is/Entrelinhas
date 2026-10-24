import { describe, expect, it } from 'vitest';
import {
  daysUntil,
  firstReview,
  intervalDays,
  isDue,
  nextReview,
  REVIEW_INTERVALS_DAYS,
} from './review-schedule';

const EVENING = new Date(2026, 9, 23, 20, 30).getTime();
const midnightIn = (days: number) => new Date(2026, 9, 23 + days).getTime();

describe('review schedule', () => {
  it('asks for a new word right away', () => {
    expect(firstReview(EVENING)).toEqual({ box: 0, dueAt: EVENING, reviews: 0 });
    expect(isDue(firstReview(EVENING), EVENING)).toBe(true);
  });

  it('brings a remembered word back at the start of a later day, further each time', () => {
    let state = firstReview(EVENING);
    const dueDays: number[] = [];
    for (let review = 0; review < 7; review += 1) {
      state = nextReview(state, true, EVENING);
      dueDays.push(daysUntil(state.dueAt, EVENING));
      expect(state.dueAt).toBe(midnightIn(dueDays.at(-1) ?? 0));
    }
    expect(dueDays).toEqual([1, 3, 7, 14, 30, 60, 60]);
    expect(state.reviews).toBe(7);
  });

  it('starts over and asks again today when the word was forgotten', () => {
    const learned = { box: 4, dueAt: EVENING, reviews: 9 };
    expect(nextReview(learned, false, EVENING)).toEqual({ box: 0, dueAt: EVENING, reviews: 10 });
  });

  it('is due once its moment has passed', () => {
    const tomorrow = nextReview(firstReview(EVENING), true, EVENING);
    expect(isDue(tomorrow, EVENING)).toBe(false);
    expect(isDue(tomorrow, midnightIn(1))).toBe(true);
  });

  it('counts calendar days, not 24-hour periods', () => {
    const lateNight = new Date(2026, 9, 23, 23, 59).getTime();
    expect(daysUntil(midnightIn(1), lateNight)).toBe(1);
    expect(daysUntil(EVENING - 1000, EVENING)).toBe(0);
  });

  it('tells how far the next interval goes for each box', () => {
    expect(REVIEW_INTERVALS_DAYS.map((_, box) => intervalDays({ box }))).toEqual([
      1, 3, 7, 14, 30, 60,
    ]);
    expect(intervalDays({ box: 99 })).toBe(60);
  });
});
