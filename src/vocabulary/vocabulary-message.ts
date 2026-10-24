import * as z from 'zod/mini';
import { NewWord, SavedWord, type VocabularyStore } from './vocabulary-store';

const word = z.string().check(z.minLength(1), z.maxLength(100));

const VocabularyRequest = z.discriminatedUnion('type', [
  z.object({ type: z.literal('projeto-bilingue:save-word'), entry: NewWord }),
  z.object({ type: z.literal('projeto-bilingue:find-word'), word }),
  z.object({ type: z.literal('projeto-bilingue:remove-word'), word }),
  z.object({ type: z.literal('projeto-bilingue:list-words') }),
  z.object({
    type: z.literal('projeto-bilingue:review-word'),
    word,
    remembered: z.boolean(),
  }),
]);

export const WordAnswer = z.object({ word: z.nullable(SavedWord) });
export const WordsAnswer = z.object({ words: z.array(SavedWord) });
export const RemovedAnswer = z.object({ removed: z.literal(true) });

export type VocabularyRequest = z.infer<typeof VocabularyRequest>;
export type VocabularyResponse =
  | z.infer<typeof WordAnswer>
  | z.infer<typeof WordsAnswer>
  | z.infer<typeof RemovedAnswer>
  | { failed: true };

export function readVocabularyRequest(data: unknown): VocabularyRequest | null {
  const request = VocabularyRequest.safeParse(data);
  return request.success ? request.data : null;
}

export async function answerVocabularyRequest(
  store: VocabularyStore,
  request: VocabularyRequest,
  now: number,
): Promise<VocabularyResponse> {
  switch (request.type) {
    case 'projeto-bilingue:save-word':
      return { word: await store.save(request.entry, now) };
    case 'projeto-bilingue:find-word':
      return { word: await store.find(request.word) };
    case 'projeto-bilingue:remove-word':
      await store.remove(request.word);
      return { removed: true };
    case 'projeto-bilingue:list-words':
      return { words: await store.list() };
    case 'projeto-bilingue:review-word':
      return { word: await store.review(request.word, request.remembered, now) };
  }
}
