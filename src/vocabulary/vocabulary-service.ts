import { browser } from 'wxt/browser';
import { logger } from '../logger';
import {
  answerVocabularyRequest,
  readVocabularyRequest,
  type VocabularyResponse,
} from './vocabulary-message';
import { VocabularyStore } from './vocabulary-store';

export function serveVocabulary(): void {
  let store: Promise<VocabularyStore> | undefined;
  const openStore = () =>
    (store ??= VocabularyStore.open().catch((error: unknown) => {
      store = undefined;
      throw error;
    }));

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const request = readVocabularyRequest(message);
    if (!request) return false;

    const respond = (response: VocabularyResponse) => {
      sendResponse(response);
    };
    openStore()
      .then((opened) => answerVocabularyRequest(opened, request, Date.now()))
      .then(respond, (error: unknown) => {
        logger.error('Vocabulary failed', error);
        respond({ failed: true });
      });
    return true;
  });
}
