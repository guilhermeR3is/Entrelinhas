import { daysUntil, intervalDays, isDue } from '../../vocabulary/review-schedule';
import type { SavedWord } from '../../vocabulary/vocabulary-store';

const count = new Intl.NumberFormat('pt-BR');

function inDays(days: number): string {
  if (days <= 0) return 'hoje';
  if (days === 1) return 'amanhã';
  return `em ${count.format(days)} dias`;
}

function words(amount: number): string {
  return amount === 1 ? '1 palavra' : `${count.format(amount)} palavras`;
}

export function dueText(saved: Pick<SavedWord, 'dueAt'>, now: number): string {
  return `volta ${isDue(saved, now) ? 'hoje' : inDays(daysUntil(saved.dueAt, now))}`;
}

export function rememberedLabel(saved: Pick<SavedWord, 'box'>): string {
  return `Lembrei · volta ${inDays(intervalDays(saved))}`;
}

export function countsText(saved: readonly SavedWord[], now: number): string {
  const due = saved.filter((word) => isDue(word, now)).length;
  const today = due === 0 ? 'Nada para revisar hoje.' : `${words(due)} para revisar hoje.`;
  const total = saved.length === 1 ? '1 salva.' : `${count.format(saved.length)} salvas.`;
  return `${today} ${total}`;
}

export function nextReviewText(saved: readonly SavedWord[], now: number): string {
  const next = saved.reduce((soonest, word) => Math.min(soonest, word.dueAt), Infinity);
  return `Nenhuma palavra para hoje. A próxima volta ${inDays(daysUntil(next, now))}.`;
}

export function reviewQueue(saved: readonly SavedWord[], now: number): SavedWord[] {
  return saved
    .filter((word) => isDue(word, now))
    .sort((first, second) => first.dueAt - second.dueAt);
}

export function byLetter(saved: readonly SavedWord[]): [string, SavedWord[]][] {
  const sorted = [...saved].sort((first, second) => first.word.localeCompare(second.word, 'en'));
  const groups = new Map<string, SavedWord[]>();
  for (const word of sorted) {
    const letter = word.word.charAt(0).toLocaleUpperCase('en');
    groups.set(letter, [...(groups.get(letter) ?? []), word]);
  }
  return [...groups];
}
