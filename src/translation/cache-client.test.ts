import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { findCachedTranslations, saveTranslations } from './cache-client';
import { serveTranslationCache } from './translation-service';

const EN_PT = { sourceLanguage: 'en', targetLanguage: 'pt' };

function answerWith(response: unknown) {
  fakeBrowser.runtime.onMessage.addListener((_message, _sender, sendResponse) => {
    sendResponse(response);
    return true;
  });
}

describe('translation cache client', () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fakeBrowser.reset();
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('saves and finds translations through the service worker', async () => {
    vi.stubGlobal('indexedDB', new IDBFactory());
    serveTranslationCache();

    await saveTranslations(EN_PT, [{ text: 'Hello', translation: 'Olá' }]);
    expect(await findCachedTranslations(EN_PT, ['Hello', 'Bye'])).toEqual(['Olá', null]);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('sends no message for empty lists', async () => {
    const sendMessage = vi.spyOn(fakeBrowser.runtime, 'sendMessage');
    expect(await findCachedTranslations(EN_PT, [])).toEqual([]);
    await saveTranslations(EN_PT, []);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('finds nothing when the service worker cannot be reached', async () => {
    expect(await findCachedTranslations(EN_PT, ['Hello'])).toEqual([null]);
    await saveTranslations(EN_PT, [{ text: 'Hello', translation: 'Olá' }]);
    expect(consoleError).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['a failure', { failed: true }],
    ['the wrong number of translations', { translations: ['Olá', 'Tchau'] }],
    ['translations that are not text', { translations: [42] }],
  ])('finds nothing when the answer is %s', async (_, response) => {
    answerWith(response);
    expect(await findCachedTranslations(EN_PT, ['Hello'])).toEqual([null]);
    expect(consoleError).toHaveBeenCalledOnce();
  });

  it('reports a save the service worker did not confirm', async () => {
    answerWith({ failed: true });
    await saveTranslations(EN_PT, [{ text: 'Hello', translation: 'Olá' }]);
    expect(consoleError).toHaveBeenCalledOnce();
  });
});
