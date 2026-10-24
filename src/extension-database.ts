const DATABASE_NAME = 'projeto-bilingue';
const DATABASE_VERSION = 2;

export const TRANSLATIONS_STORE = 'translations';
export const VOCABULARY_STORE = 'vocabulary';

export async function openExtensionDatabase(factory: IDBFactory = indexedDB): Promise<IDBDatabase> {
  const request = factory.open(DATABASE_NAME, DATABASE_VERSION);
  request.onupgradeneeded = (event) => {
    const database = request.result;
    if (event.oldVersion < 1) {
      database.createObjectStore(TRANSLATIONS_STORE, {
        keyPath: ['sourceLanguage', 'targetLanguage', 'text'],
      });
    }
    if (event.oldVersion < 2) database.createObjectStore(VOCABULARY_STORE, { keyPath: 'word' });
  };
  return settle(request);
}

export function settle<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(request.error ?? new Error('IndexedDB request failed'));
    };
  });
}

export function completion(transaction: IDBTransaction): Promise<void> {
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
