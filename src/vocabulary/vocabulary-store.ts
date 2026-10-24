import * as z from 'zod/mini';
import {
  completion,
  openExtensionDatabase,
  settle,
  VOCABULARY_STORE as STORE,
} from '../extension-database';
import { logger } from '../logger';
import { firstReview, nextReview } from './review-schedule';

export const NewWord = z.object({
  word: z.string().check(z.minLength(1), z.maxLength(100)),
  shown: z.string().check(z.minLength(1), z.maxLength(100)),
  translation: z.nullable(z.string().check(z.maxLength(500))),
  sentence: z.string().check(z.maxLength(1000)),
  sentenceTranslation: z.nullable(z.string().check(z.maxLength(1000))),
  videoTitle: z.string().check(z.maxLength(500)),
  videoUrl: z.string().check(z.maxLength(2000)),
  timeMs: z.number().check(z.gte(0)),
});

export const SavedWord = z.extend(NewWord, {
  savedAt: z.number(),
  box: z.number().check(z.int(), z.gte(0)),
  dueAt: z.number(),
  reviews: z.number().check(z.int(), z.gte(0)),
});

export type NewWord = z.infer<typeof NewWord>;
export type SavedWord = z.infer<typeof SavedWord>;

export class VocabularyStore {
  private constructor(private readonly database: IDBDatabase) {}

  static async open(factory: IDBFactory = indexedDB): Promise<VocabularyStore> {
    return new VocabularyStore(await openExtensionDatabase(factory));
  }

  async find(word: string): Promise<SavedWord | null> {
    const store = this.database.transaction(STORE, 'readonly').objectStore(STORE);
    return readSaved(await settle(store.get(word)));
  }

  async list(): Promise<SavedWord[]> {
    const store = this.database.transaction(STORE, 'readonly').objectStore(STORE);
    const stored = await settle(store.getAll());
    return stored.flatMap((entry: unknown) => readSaved(entry) ?? []);
  }

  async save(entry: NewWord, now: number): Promise<SavedWord> {
    const transaction = this.database.transaction(STORE, 'readwrite');
    const store = transaction.objectStore(STORE);
    const existing = readSaved(await settle(store.get(entry.word)));
    const saved: SavedWord = existing
      ? { ...existing, ...entry }
      : { ...entry, savedAt: now, ...firstReview(now) };
    store.put(saved);
    await completion(transaction);
    return saved;
  }

  async review(word: string, remembered: boolean, now: number): Promise<SavedWord | null> {
    const transaction = this.database.transaction(STORE, 'readwrite');
    const store = transaction.objectStore(STORE);
    const existing = readSaved(await settle(store.get(word)));
    if (!existing) return null;
    const reviewed = { ...existing, ...nextReview(existing, remembered, now) };
    store.put(reviewed);
    await completion(transaction);
    return reviewed;
  }

  async remove(word: string): Promise<void> {
    const transaction = this.database.transaction(STORE, 'readwrite');
    transaction.objectStore(STORE).delete(word);
    await completion(transaction);
  }

  close(): void {
    this.database.close();
  }
}

function readSaved(stored: unknown): SavedWord | null {
  if (stored === undefined) return null;
  const saved = SavedWord.safeParse(stored);
  if (saved.success) return saved.data;
  logger.error('Ignored an invalid saved word', saved.error);
  return null;
}
