export type LanguagePair = { sourceLanguage: string; targetLanguage: string };
export type Translation = { text: string; translation: string };

type StoredTranslation = LanguagePair & Translation & { savedAt: number };

const DATABASE_NAME = 'projeto-bilingue';
const DATABASE_VERSION = 1;
const STORE = 'translations';

export class TranslationCache {
  private constructor(private readonly database: IDBDatabase) {}

  static async open(factory: IDBFactory = indexedDB): Promise<TranslationCache> {
    const request = factory.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE, {
        keyPath: ['sourceLanguage', 'targetLanguage', 'text'],
      });
    };
    return new TranslationCache(await settle(request));
  }

  async find(pair: LanguagePair, texts: readonly string[]): Promise<(string | null)[]> {
    const store = this.database.transaction(STORE, 'readonly').objectStore(STORE);
    const found = await Promise.all(
      texts.map(
        (text) =>
          settle(store.get([pair.sourceLanguage, pair.targetLanguage, text])) as Promise<
            StoredTranslation | undefined
          >,
      ),
    );
    return found.map((stored) => stored?.translation ?? null);
  }

  async save(
    pair: LanguagePair,
    translations: readonly Translation[],
    savedAt: number,
  ): Promise<void> {
    const transaction = this.database.transaction(STORE, 'readwrite');
    const store = transaction.objectStore(STORE);
    for (const { text, translation } of translations) {
      const stored: StoredTranslation = { ...pair, text, translation, savedAt };
      store.put(stored);
    }
    await completion(transaction);
  }

  close(): void {
    this.database.close();
  }
}

function settle<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(request.error ?? new Error('IndexedDB request failed'));
    };
  });
}

function completion(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => {
      resolve();
    };
    transaction.onerror = () => {
      reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    };
    transaction.onabort = () => {
      reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
    };
  });
}
