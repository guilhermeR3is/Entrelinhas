import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { serveTranslationCache } from './translation-service';

const PAIR = { sourceLanguage: 'en', targetLanguage: 'pt' };

function find(texts: string[]) {
  return fakeBrowser.runtime.sendMessage({
    type: 'projeto-bilingue:find-translations',
    ...PAIR,
    texts,
  });
}

function save(translations: { text: string; translation: string }[]) {
  return fakeBrowser.runtime.sendMessage({
    type: 'projeto-bilingue:save-translations',
    ...PAIR,
    translations,
  });
}

describe('serveTranslationCache', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('answers find and save requests from the content script', async () => {
    vi.stubGlobal('indexedDB', new IDBFactory());
    serveTranslationCache();

    expect(await find(['Hello'])).toEqual({ translations: [null] });
    expect(await save([{ text: 'Hello', translation: 'Olá' }])).toEqual({ saved: true });
    expect(await find(['Hello'])).toEqual({ translations: ['Olá'] });
  });

  it('leaves other messages unanswered', async () => {
    vi.stubGlobal('indexedDB', new IDBFactory());
    serveTranslationCache();

    expect(await fakeBrowser.runtime.sendMessage({ type: 'something-else' })).toBeUndefined();
  });

  it('reports a failure and opens the database again on the next request', async () => {
    const working = new IDBFactory();
    vi.stubGlobal('indexedDB', {
      open: () => {
        throw new DOMException('Storage is not available', 'InvalidStateError');
      },
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    serveTranslationCache();

    expect(await find(['Hello'])).toEqual({ failed: true });
    expect(consoleError).toHaveBeenCalledOnce();

    vi.stubGlobal('indexedDB', working);
    expect(await find(['Hello'])).toEqual({ translations: [null] });
  });
});
