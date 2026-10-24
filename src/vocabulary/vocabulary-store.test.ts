import { IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VOCABULARY_STORE } from '../extension-database';
import type { NewWord } from './vocabulary-store';
import { VocabularyStore } from './vocabulary-store';

const NOW = new Date(2026, 9, 23, 20, 30).getTime();
const TOMORROW = new Date(2026, 9, 24).getTime();

const ZEITGEIST: NewWord = {
  word: 'zeitgeist',
  shown: 'Zeitgeist',
  translation: 'espírito da época',
  sentence: 'Zeitgeist is a German word.',
  sentenceTranslation: 'Zeitgeist é uma palavra alemã.',
  videoTitle: 'Words we borrowed',
  videoUrl: 'https://www.youtube.com/watch?v=abc&t=83s',
  timeMs: 83_250,
};

async function openStore() {
  const factory = new IDBFactory();
  return { factory, store: await VocabularyStore.open(factory) };
}

describe('VocabularyStore', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('saves a new word ready to review right away', async () => {
    const { store } = await openStore();

    const saved = await store.save(ZEITGEIST, NOW);

    expect(saved).toEqual({ ...ZEITGEIST, savedAt: NOW, box: 0, dueAt: NOW, reviews: 0 });
    expect(await store.find('zeitgeist')).toEqual(saved);
    expect(await store.find('house')).toBeNull();
  });

  it('keeps the review progress when the same word is saved again from another video', async () => {
    const { store } = await openStore();
    await store.save(ZEITGEIST, NOW);
    await store.review('zeitgeist', true, NOW);

    const again = await store.save({ ...ZEITGEIST, videoTitle: 'Second video' }, NOW + 5000);

    expect(again).toMatchObject({ videoTitle: 'Second video', savedAt: NOW, box: 1, reviews: 1 });
  });

  it('records each review and leaves unknown words alone', async () => {
    const { store } = await openStore();
    await store.save(ZEITGEIST, NOW);

    expect(await store.review('zeitgeist', true, NOW)).toMatchObject({
      box: 1,
      dueAt: TOMORROW,
      reviews: 1,
    });
    expect(await store.review('zeitgeist', false, NOW)).toMatchObject({
      box: 0,
      dueAt: NOW,
      reviews: 2,
    });
    expect(await store.review('house', true, NOW)).toBeNull();
  });

  it('lists and removes words', async () => {
    const { store } = await openStore();
    await store.save(ZEITGEIST, NOW);
    await store.save({ ...ZEITGEIST, word: 'house', shown: 'house' }, NOW);

    expect((await store.list()).map((word) => word.word)).toEqual(['house', 'zeitgeist']);
    await store.remove('house');
    expect((await store.list()).map((word) => word.word)).toEqual(['zeitgeist']);
  });

  it('skips entries that do not look like a saved word', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { factory, store } = await openStore();
    await store.save(ZEITGEIST, NOW);
    store.close();
    await new Promise<void>((resolve, reject) => {
      const request = factory.open('projeto-bilingue');
      request.onerror = () => {
        reject(request.error ?? new Error('open failed'));
      };
      request.onsuccess = () => {
        const transaction = request.result.transaction(VOCABULARY_STORE, 'readwrite');
        transaction.objectStore(VOCABULARY_STORE).put({ word: 'broken', box: 'first' });
        transaction.oncomplete = () => {
          request.result.close();
          resolve();
        };
      };
    });

    const reopened = await VocabularyStore.open(factory);

    expect((await reopened.list()).map((word) => word.word)).toEqual(['zeitgeist']);
    expect(await reopened.find('broken')).toBeNull();
    expect(consoleError).toHaveBeenCalledTimes(import.meta.env.DEV ? 2 : 0);
  });
});
