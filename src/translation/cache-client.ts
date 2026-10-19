import { browser } from 'wxt/browser';
import { logger } from '../logger';
import type { LanguagePair, Translation } from './translation-cache';
import { isSavedResponse, readFoundTranslations } from './translation-message';

export async function findCachedTranslations(
  pair: LanguagePair,
  texts: readonly string[],
): Promise<(string | null)[]> {
  const notFound = texts.map(() => null);
  if (texts.length === 0) return notFound;
  try {
    const response: unknown = await browser.runtime.sendMessage({
      type: 'projeto-bilingue:find-translations',
      ...pair,
      texts,
    });
    const found = readFoundTranslations(response, texts.length);
    if (!found) logger.error('Unexpected translation cache answer', response);
    return found ?? notFound;
  } catch (error) {
    logger.error('Translation cache unreachable', error);
    return notFound;
  }
}

export async function saveTranslations(
  pair: LanguagePair,
  translations: readonly Translation[],
): Promise<void> {
  if (translations.length === 0) return;
  try {
    const response: unknown = await browser.runtime.sendMessage({
      type: 'projeto-bilingue:save-translations',
      ...pair,
      translations,
    });
    if (!isSavedResponse(response)) logger.error('Translations not saved', response);
  } catch (error) {
    logger.error('Translation cache unreachable', error);
  }
}
