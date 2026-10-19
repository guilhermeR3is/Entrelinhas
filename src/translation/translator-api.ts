import type { LanguagePair } from './translation-cache';

export type TranslatorAvailability = 'unavailable' | 'downloadable' | 'downloading' | 'available';

export type TranslatorCreateOptions = LanguagePair & {
  monitor?: (monitor: EventTarget) => void;
  signal?: AbortSignal;
};

export interface Translator {
  translate(text: string, options?: { signal?: AbortSignal }): Promise<string>;
  destroy(): void;
}

export interface TranslatorApi {
  availability(options: LanguagePair): Promise<TranslatorAvailability>;
  create(options: TranslatorCreateOptions): Promise<Translator>;
}

export function findTranslatorApi(scope: object): TranslatorApi | null {
  const api: unknown = Reflect.get(scope, 'Translator');
  if (typeof api !== 'function' && (typeof api !== 'object' || api === null)) return null;
  const { availability, create } = api as Partial<Record<keyof TranslatorApi, unknown>>;
  if (typeof availability !== 'function' || typeof create !== 'function') return null;
  return api as TranslatorApi;
}
