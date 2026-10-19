import { logger } from '../logger';
import type { LanguagePair } from './translation-cache';
import type { Translator, TranslatorApi, TranslatorAvailability } from './translator-api';

export type TranslatorStatus =
  | { kind: 'unsupported' }
  | { kind: 'waiting-for-gesture' }
  | { kind: 'downloading'; progress: number }
  | { kind: 'ready' }
  | { kind: 'failed' };

type GesturePage = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;

const GESTURES = ['pointerdown', 'keydown'] as const;

export async function prepareTranslator(
  api: TranslatorApi | null,
  pair: LanguagePair,
  page: GesturePage,
  onStatus: (status: TranslatorStatus) => void,
  signal: AbortSignal,
): Promise<Translator | null> {
  if (!api) {
    onStatus({ kind: 'unsupported' });
    return null;
  }
  let availability: TranslatorAvailability;
  try {
    availability = await api.availability(pair);
  } catch (error) {
    logger.error('Translator availability unknown', error);
    onStatus({ kind: 'failed' });
    return null;
  }
  if (availability === 'unavailable') {
    onStatus({ kind: 'unsupported' });
    return null;
  }

  const needsDownload = availability !== 'available';
  for (;;) {
    if (needsDownload) {
      onStatus({ kind: 'waiting-for-gesture' });
      if (!(await nextGesture(page, signal))) return null;
    }

    try {
      const translator = await api.create({
        ...pair,
        signal,
        monitor: (monitor) => {
          monitor.addEventListener('downloadprogress', (event) => {
            if (needsDownload) onStatus({ kind: 'downloading', progress: progressOf(event) });
          });
        },
      });
      onStatus({ kind: 'ready' });
      return translator;
    } catch (error) {
      if (signal.aborted) return null;
      if (needsDownload && error instanceof DOMException && error.name === 'NotAllowedError') {
        continue;
      }
      logger.error('Translator could not be created', error);
      onStatus({ kind: 'failed' });
      return null;
    }
  }
}

function nextGesture(page: GesturePage, signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    const stop = () => {
      for (const type of GESTURES) page.removeEventListener(type, onGesture, true);
      signal.removeEventListener('abort', onAbort);
    };
    const onGesture = (event: Event) => {
      if (!event.isTrusted) return;
      stop();
      resolve(true);
    };
    const onAbort = () => {
      stop();
      resolve(false);
    };
    for (const type of GESTURES) page.addEventListener(type, onGesture, true);
    signal.addEventListener('abort', onAbort);
    if (signal.aborted) onAbort();
  });
}

function progressOf(event: Event): number {
  const loaded: unknown = Reflect.get(event, 'loaded');
  return typeof loaded === 'number' ? Math.min(Math.max(loaded, 0), 1) : 0;
}
