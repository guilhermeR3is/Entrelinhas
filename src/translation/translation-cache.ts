import {
  completion,
  openExtensionDatabase,
  settle,
  TRANSLATIONS_STORE as STORE,
} from '../extension-database';

export type LanguagePair = { sourceLanguage: string; targetLanguage: string };
export type Translation = { text: string; translation: string };

type StoredTranslation = LanguagePair & Translation & { savedAt: number };

export class TranslationCache {
  private constructor(private readonly database: IDBDatabase) {}

  static async open(factory: IDBFactory = indexedDB): Promise<TranslationCache> {
    return new TranslationCache(await openExtensionDatabase(factory));
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
