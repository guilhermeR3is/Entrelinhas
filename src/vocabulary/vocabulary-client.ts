import { browser } from 'wxt/browser';
import type * as z from 'zod/mini';
import { RemovedAnswer, WordAnswer, WordsAnswer } from './vocabulary-message';
import type { NewWord, SavedWord } from './vocabulary-store';

export class VocabularyUnavailableError extends Error {
  constructor(answer: unknown) {
    super('Unexpected vocabulary answer', { cause: answer });
    this.name = 'VocabularyUnavailableError';
  }
}

async function ask<Answer>(schema: z.ZodMiniType<Answer>, request: object): Promise<Answer> {
  const answer: unknown = await browser.runtime.sendMessage(request);
  const parsed = schema.safeParse(answer);
  if (!parsed.success) throw new VocabularyUnavailableError(answer);
  return parsed.data;
}

export async function saveWord(entry: NewWord): Promise<SavedWord> {
  const { word } = await ask(WordAnswer, { type: 'projeto-bilingue:save-word', entry });
  if (!word) throw new VocabularyUnavailableError(word);
  return word;
}

export async function findWord(word: string): Promise<SavedWord | null> {
  return (await ask(WordAnswer, { type: 'projeto-bilingue:find-word', word })).word;
}

export async function removeWord(word: string): Promise<void> {
  await ask(RemovedAnswer, { type: 'projeto-bilingue:remove-word', word });
}

export async function listWords(): Promise<SavedWord[]> {
  return (await ask(WordsAnswer, { type: 'projeto-bilingue:list-words' })).words;
}

export async function reviewWord(word: string, remembered: boolean): Promise<SavedWord | null> {
  const request = { type: 'projeto-bilingue:review-word', word, remembered };
  return (await ask(WordAnswer, request)).word;
}
