import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  findWord,
  listWords,
  removeWord,
  reviewWord,
  saveWord,
  VocabularyUnavailableError,
} from './vocabulary-client';
import { serveVocabulary } from './vocabulary-service';
import type { NewWord } from './vocabulary-store';

const HOUSE: NewWord = {
  word: 'house',
  shown: 'House',
  translation: 'casa',
  sentence: 'House of cards.',
  sentenceTranslation: null,
  videoTitle: 'Lesson',
  videoUrl: 'http://localhost/lesson',
  timeMs: 1000,
};

describe('serveVocabulary', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('saves, finds, reviews, lists and removes words for the other parts of the extension', async () => {
    vi.stubGlobal('indexedDB', new IDBFactory());
    serveVocabulary();

    expect(await findWord('house')).toBeNull();
    expect(await saveWord(HOUSE)).toMatchObject({ word: 'house', box: 0, reviews: 0 });
    expect(await findWord('house')).toMatchObject({ translation: 'casa' });
    expect(await reviewWord('house', true)).toMatchObject({ box: 1, reviews: 1 });
    expect((await listWords()).map((saved) => saved.word)).toEqual(['house']);
    await removeWord('house');
    expect(await listWords()).toEqual([]);
  });

  it('refuses a word that does not follow the expected shape', async () => {
    vi.stubGlobal('indexedDB', new IDBFactory());
    serveVocabulary();

    const answer: unknown = await fakeBrowser.runtime.sendMessage({
      type: 'projeto-bilingue:save-word',
      entry: { ...HOUSE, word: '' },
    });

    expect(answer).toBeUndefined();
  });

  it('answers with a failure when the database cannot open, and the client says so', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal('indexedDB', {
      open: () => {
        throw new DOMException('Storage is not available', 'InvalidStateError');
      },
    });
    serveVocabulary();

    await expect(listWords()).rejects.toBeInstanceOf(VocabularyUnavailableError);
    await expect(saveWord(HOUSE)).rejects.toMatchObject({ cause: { failed: true } });
  });
});
