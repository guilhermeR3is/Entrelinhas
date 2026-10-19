import { browser } from 'wxt/browser';
import { logger } from '../logger';
import { TranslationCache } from './translation-cache';
import {
  answerTranslationRequest,
  readTranslationRequest,
  type TranslationResponse,
} from './translation-message';

export function serveTranslationCache(): void {
  let cache: Promise<TranslationCache> | undefined;
  const openCache = () =>
    (cache ??= TranslationCache.open().catch((error: unknown) => {
      cache = undefined;
      throw error;
    }));

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const request = readTranslationRequest(message);
    if (!request) return false;

    const respond = (response: TranslationResponse) => {
      sendResponse(response);
    };
    openCache()
      .then((opened) => answerTranslationRequest(opened, request, Date.now()))
      .then(respond, (error: unknown) => {
        logger.error('Translation cache failed', error);
        respond({ failed: true });
      });
    return true;
  });
}
