import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { TranslationCache } from './translation-cache';
import { answerTranslationRequest, readTranslationRequest } from './translation-message';

const FIND = {
  type: 'projeto-bilingue:find-translations',
  sourceLanguage: 'en',
  targetLanguage: 'pt',
  texts: ['Hello'],
};
const SAVE = {
  type: 'projeto-bilingue:save-translations',
  sourceLanguage: 'en',
  targetLanguage: 'pt',
  translations: [{ text: 'Hello', translation: 'Olá' }],
};

function request(data: unknown) {
  const read = readTranslationRequest(data);
  if (!read) throw new Error('expected a valid translation request');
  return read;
}

describe('readTranslationRequest', () => {
  it.each([
    ['a find request', FIND],
    ['a save request', SAVE],
    ['a find request with no texts', { ...FIND, texts: [] }],
  ])('accepts %s', (_, data) => {
    expect(readTranslationRequest(data)).toEqual(data);
  });

  it.each([
    ['nothing', undefined],
    ['a message from another part of the extension', { type: 'projeto-bilingue:caption-track' }],
    ['an empty language', { ...FIND, sourceLanguage: '' }],
    ['texts that are not strings', { ...FIND, texts: [42] }],
    ['a save without the translation', { ...SAVE, translations: [{ text: 'Hello' }] }],
    ['a find carrying translations instead of texts', { ...SAVE, type: FIND.type }],
  ])('rejects %s', (_, data) => {
    expect(readTranslationRequest(data)).toBeNull();
  });
});

describe('answerTranslationRequest', () => {
  it('saves translations and finds them again', async () => {
    const cache = await TranslationCache.open(new IDBFactory());
    expect(await answerTranslationRequest(cache, request(SAVE), 1000)).toEqual({ saved: true });
    expect(
      await answerTranslationRequest(cache, request({ ...FIND, texts: ['Hello', 'Bye'] }), 2000),
    ).toEqual({ translations: ['Olá', null] });
  });

  it('lets the cache error reach the caller', async () => {
    const cache = await TranslationCache.open(new IDBFactory());
    cache.close();
    await expect(answerTranslationRequest(cache, request(FIND), 1000)).rejects.toThrow();
  });
});
