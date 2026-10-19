import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { TranslationCache } from './translation-cache';

const EN_PT = { sourceLanguage: 'en', targetLanguage: 'pt' };
const EN_ES = { sourceLanguage: 'en', targetLanguage: 'es' };

async function openCache() {
  const factory = new IDBFactory();
  return { factory, cache: await TranslationCache.open(factory) };
}

describe('TranslationCache', () => {
  it('finds nothing in a new database', async () => {
    const { cache } = await openCache();
    expect(await cache.find(EN_PT, ['Hello', 'Bye'])).toEqual([null, null]);
  });

  it('finds saved translations in the order they were asked', async () => {
    const { cache } = await openCache();
    await cache.save(
      EN_PT,
      [
        { text: 'Hello', translation: 'Olá' },
        { text: 'Bye', translation: 'Tchau' },
      ],
      1000,
    );
    expect(await cache.find(EN_PT, ['Bye', 'Missing', 'Hello', 'Bye'])).toEqual([
      'Tchau',
      null,
      'Olá',
      'Tchau',
    ]);
  });

  it('keeps each language pair apart', async () => {
    const { cache } = await openCache();
    await cache.save(EN_PT, [{ text: 'Hello', translation: 'Olá' }], 1000);
    await cache.save(EN_ES, [{ text: 'Hello', translation: 'Hola' }], 1000);
    expect(await cache.find(EN_PT, ['Hello'])).toEqual(['Olá']);
    expect(await cache.find(EN_ES, ['Hello'])).toEqual(['Hola']);
    expect(await cache.find({ sourceLanguage: 'pt', targetLanguage: 'en' }, ['Hello'])).toEqual([
      null,
    ]);
  });

  it('treats texts that differ only in case or spaces as different', async () => {
    const { cache } = await openCache();
    await cache.save(EN_PT, [{ text: 'Hello', translation: 'Olá' }], 1000);
    expect(await cache.find(EN_PT, ['hello', 'Hello ', 'Hello'])).toEqual([null, null, 'Olá']);
  });

  it('replaces a translation saved again', async () => {
    const { cache } = await openCache();
    await cache.save(EN_PT, [{ text: 'Hello', translation: 'Oi' }], 1000);
    await cache.save(EN_PT, [{ text: 'Hello', translation: 'Olá' }], 2000);
    expect(await cache.find(EN_PT, ['Hello'])).toEqual(['Olá']);
  });

  it('accepts empty lists', async () => {
    const { cache } = await openCache();
    await cache.save(EN_PT, [], 1000);
    expect(await cache.find(EN_PT, [])).toEqual([]);
  });

  it('keeps translations after the database is closed and opened again', async () => {
    const { factory, cache } = await openCache();
    await cache.save(EN_PT, [{ text: 'Hello', translation: 'Olá' }], 1000);
    cache.close();
    const reopened = await TranslationCache.open(factory);
    expect(await reopened.find(EN_PT, ['Hello'])).toEqual(['Olá']);
  });

  it('stores when each translation was saved', async () => {
    const { factory, cache } = await openCache();
    await cache.save(EN_PT, [{ text: 'Hello', translation: 'Olá' }], 1234);
    cache.close();
    const stored = await new Promise<unknown>((resolve, reject) => {
      const request = factory.open('projeto-bilingue');
      request.onerror = () => {
        reject(request.error ?? new Error('open failed'));
      };
      request.onsuccess = () => {
        const get = request.result
          .transaction('translations')
          .objectStore('translations')
          .get(['en', 'pt', 'Hello']);
        get.onsuccess = () => {
          resolve(get.result);
        };
      };
    });
    expect(stored).toEqual({
      sourceLanguage: 'en',
      targetLanguage: 'pt',
      text: 'Hello',
      translation: 'Olá',
      savedAt: 1234,
    });
  });
});
