import * as z from 'zod/mini';
import type { TranslationCache } from './translation-cache';

const languageTag = z.string().check(z.minLength(1));

const TranslationRequest = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('projeto-bilingue:find-translations'),
    sourceLanguage: languageTag,
    targetLanguage: languageTag,
    texts: z.array(z.string()),
  }),
  z.object({
    type: z.literal('projeto-bilingue:save-translations'),
    sourceLanguage: languageTag,
    targetLanguage: languageTag,
    translations: z.array(z.object({ text: z.string(), translation: z.string() })),
  }),
]);

export type TranslationRequest = z.infer<typeof TranslationRequest>;
export type TranslationResponse =
  { translations: (string | null)[] } | { saved: true } | { failed: true };

export function readTranslationRequest(data: unknown): TranslationRequest | null {
  const request = TranslationRequest.safeParse(data);
  return request.success ? request.data : null;
}

export async function answerTranslationRequest(
  cache: TranslationCache,
  request: TranslationRequest,
  now: number,
): Promise<TranslationResponse> {
  const { sourceLanguage, targetLanguage } = request;
  if (request.type === 'projeto-bilingue:find-translations') {
    return { translations: await cache.find({ sourceLanguage, targetLanguage }, request.texts) };
  }
  await cache.save({ sourceLanguage, targetLanguage }, request.translations, now);
  return { saved: true };
}
