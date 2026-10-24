const LONGEST_INTERVAL_DAYS = 60;
export const REVIEW_INTERVALS_DAYS = [1, 3, 7, 14, 30, LONGEST_INTERVAL_DAYS] as const;

export interface ReviewState {
  box: number;
  dueAt: number;
  reviews: number;
}

export function firstReview(now: number): ReviewState {
  return { box: 0, dueAt: now, reviews: 0 };
}

export function nextReview(state: ReviewState, remembered: boolean, now: number): ReviewState {
  if (!remembered) return { box: 0, dueAt: now, reviews: state.reviews + 1 };
  return {
    box: Math.min(state.box + 1, REVIEW_INTERVALS_DAYS.length - 1),
    dueAt: daysAfter(now, intervalDays(state)),
    reviews: state.reviews + 1,
  };
}

export function intervalDays(state: Pick<ReviewState, 'box'>): number {
  return REVIEW_INTERVALS_DAYS[state.box] ?? LONGEST_INTERVAL_DAYS;
}

export function isDue(state: Pick<ReviewState, 'dueAt'>, now: number): boolean {
  return state.dueAt <= now;
}

export function daysUntil(dueAt: number, now: number): number {
  const days = Math.round((startOfDay(dueAt) - startOfDay(now)) / 86_400_000);
  return Math.max(0, days);
}

function daysAfter(time: number, days: number): number {
  const day = new Date(startOfDay(time));
  day.setDate(day.getDate() + days);
  return day.getTime();
}

function startOfDay(time: number): number {
  const day = new Date(time);
  day.setHours(0, 0, 0, 0);
  return day.getTime();
}
