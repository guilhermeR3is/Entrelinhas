import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { openExtensionDatabase } from './extension-database';
import { TranslationCache } from './translation/translation-cache';

function openFirstVersion(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open('projeto-bilingue', 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore('translations', {
        keyPath: ['sourceLanguage', 'targetLanguage', 'text'],
      });
      store.put({
        sourceLanguage: 'en',
        targetLanguage: 'pt',
        text: 'Hello',
        translation: 'Olá',
        savedAt: 1,
      });
    };
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(request.error ?? new Error('open failed'));
    };
  });
}

describe('openExtensionDatabase', () => {
  it('creates both stores in a new browser', async () => {
    const database = await openExtensionDatabase(new IDBFactory());

    expect([...database.objectStoreNames]).toEqual(['translations', 'vocabulary']);
    expect(database.version).toBe(2);
  });

  it('adds the vocabulary to a database from an older version and keeps its translations', async () => {
    const factory = new IDBFactory();
    (await openFirstVersion(factory)).close();

    const database = await openExtensionDatabase(factory);
    database.close();

    expect([...database.objectStoreNames]).toEqual(['translations', 'vocabulary']);
    const cache = await TranslationCache.open(factory);
    expect(await cache.find({ sourceLanguage: 'en', targetLanguage: 'pt' }, ['Hello'])).toEqual([
      'Olá',
    ]);
  });
});
