import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  Translator,
  TranslatorApi,
  TranslatorAvailability,
  TranslatorCreateOptions,
} from './translator-api';
import { prepareTranslator, type TranslatorStatus } from './translator-setup';

const EN_PT = { sourceLanguage: 'en', targetLanguage: 'pt' };
const TRANSLATOR: Translator = {
  translate: (text) => Promise.resolve(text),
  destroy: () => undefined,
};

type CreateStep = (options: TranslatorCreateOptions) => Promise<Translator>;

function fakeApi(availability: TranslatorAvailability, ...createSteps: CreateStep[]) {
  const created: TranslatorCreateOptions[] = [];
  const api: TranslatorApi = {
    availability: () => Promise.resolve(availability),
    create: (options) => {
      created.push(options);
      const step = createSteps.shift() ?? (() => Promise.resolve(TRANSLATOR));
      return step(options);
    },
  };
  return { api, created };
}

function downloadingWith(...progress: number[]): CreateStep {
  return (options) => {
    const monitor = new EventTarget();
    options.monitor?.(monitor);
    for (const loaded of progress) {
      monitor.dispatchEvent(Object.assign(new Event('downloadprogress'), { loaded }));
    }
    return Promise.resolve(TRANSLATOR);
  };
}

function fakePage() {
  const listeners = new Map<string, EventListener>();
  const page = {
    addEventListener: (type: string, listener: EventListener) => {
      listeners.set(type, listener);
    },
    removeEventListener: (type: string) => {
      listeners.delete(type);
    },
  } as Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;
  const gesture = (type = 'pointerdown', isTrusted = true) => {
    listeners.get(type)?.({ isTrusted } as Event);
  };
  return { page, gesture, listeners };
}

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('prepareTranslator', () => {
  let statuses: TranslatorStatus[];
  let consoleError: ReturnType<typeof vi.spyOn>;
  const onStatus = (status: TranslatorStatus) => statuses.push(status);

  beforeEach(() => {
    statuses = [];
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports a browser without the Translator API', async () => {
    const { page } = fakePage();
    const signal = new AbortController().signal;
    expect(await prepareTranslator(null, EN_PT, page, onStatus, signal)).toBeNull();
    expect(statuses).toEqual([{ kind: 'unsupported' }]);
  });

  it('reports a language pair the device cannot translate', async () => {
    const { page } = fakePage();
    const { api, created } = fakeApi('unavailable');
    const signal = new AbortController().signal;
    expect(await prepareTranslator(api, EN_PT, page, onStatus, signal)).toBeNull();
    expect(statuses).toEqual([{ kind: 'unsupported' }]);
    expect(created).toEqual([]);
  });

  it('creates the translator right away when the model is already there', async () => {
    const { page, listeners } = fakePage();
    const { api, created } = fakeApi('available', downloadingWith(0, 1));
    const signal = new AbortController().signal;

    expect(await prepareTranslator(api, EN_PT, page, onStatus, signal)).toBe(TRANSLATOR);
    expect(statuses).toEqual([{ kind: 'ready' }]);
    expect(created).toMatchObject([{ sourceLanguage: 'en', targetLanguage: 'pt', signal }]);
    expect(listeners.size).toBe(0);
  });

  it.each([['downloadable'], ['downloading']] as const)(
    'waits for the first click when the model is %s, then shows the download',
    async (availability) => {
      const { page, gesture, listeners } = fakePage();
      const { api, created } = fakeApi(availability, downloadingWith(0, 0.4, 1));
      const preparing = prepareTranslator(api, EN_PT, page, onStatus, new AbortController().signal);

      await settle();
      expect(statuses).toEqual([{ kind: 'waiting-for-gesture' }]);
      expect([...listeners.keys()]).toEqual(['pointerdown', 'keydown']);
      expect(created).toEqual([]);

      gesture('pointerdown');
      expect(await preparing).toBe(TRANSLATOR);
      expect(statuses).toEqual([
        { kind: 'waiting-for-gesture' },
        { kind: 'downloading', progress: 0 },
        { kind: 'downloading', progress: 0.4 },
        { kind: 'downloading', progress: 1 },
        { kind: 'ready' },
      ]);
      expect(listeners.size).toBe(0);
    },
  );

  it('accepts a key press as the gesture', async () => {
    const { page, gesture } = fakePage();
    const { api } = fakeApi('downloadable');
    const preparing = prepareTranslator(api, EN_PT, page, onStatus, new AbortController().signal);
    await settle();
    gesture('keydown');
    expect(await preparing).toBe(TRANSLATOR);
  });

  it('ignores events the page created by script', async () => {
    const { page, gesture } = fakePage();
    const { api, created } = fakeApi('downloadable');
    void prepareTranslator(api, EN_PT, page, onStatus, new AbortController().signal);
    await settle();
    gesture('pointerdown', false);
    await settle();
    expect(created).toEqual([]);
  });

  it('waits for another gesture when Chrome refuses the first one', async () => {
    const { page, gesture } = fakePage();
    const refuse: CreateStep = () =>
      Promise.reject(new DOMException('Requires a user gesture', 'NotAllowedError'));
    const { api, created } = fakeApi('downloadable', refuse);
    const preparing = prepareTranslator(api, EN_PT, page, onStatus, new AbortController().signal);

    await settle();
    gesture();
    await settle();
    expect(statuses).toEqual([{ kind: 'waiting-for-gesture' }, { kind: 'waiting-for-gesture' }]);

    gesture();
    expect(await preparing).toBe(TRANSLATOR);
    expect(created).toHaveLength(2);
  });

  it('reports a download that failed', async () => {
    const { page, gesture } = fakePage();
    const { api } = fakeApi('downloadable', () => Promise.reject(new Error('network down')));
    const preparing = prepareTranslator(api, EN_PT, page, onStatus, new AbortController().signal);
    await settle();
    gesture();
    expect(await preparing).toBeNull();
    expect(statuses.at(-1)).toEqual({ kind: 'failed' });
    expect(consoleError).toHaveBeenCalledOnce();
  });

  it('reports a failure when the availability cannot be read', async () => {
    const { page } = fakePage();
    const api: TranslatorApi = {
      availability: () => Promise.reject(new Error('broken')),
      create: () => Promise.resolve(TRANSLATOR),
    };
    const signal = new AbortController().signal;
    expect(await prepareTranslator(api, EN_PT, page, onStatus, signal)).toBeNull();
    expect(statuses).toEqual([{ kind: 'failed' }]);
  });

  it('stops waiting and lets go of the page when it is cancelled', async () => {
    const { page, listeners } = fakePage();
    const { api, created } = fakeApi('downloadable');
    const controller = new AbortController();
    const preparing = prepareTranslator(api, EN_PT, page, onStatus, controller.signal);

    await settle();
    controller.abort();
    expect(await preparing).toBeNull();
    expect(listeners.size).toBe(0);
    expect(created).toEqual([]);
    expect(statuses).toEqual([{ kind: 'waiting-for-gesture' }]);
  });

  it('stays quiet when cancelled during the download', async () => {
    const { page, gesture } = fakePage();
    const controller = new AbortController();
    const { api } = fakeApi('downloadable', () => {
      controller.abort();
      return Promise.reject(new DOMException('Aborted', 'AbortError'));
    });
    const preparing = prepareTranslator(api, EN_PT, page, onStatus, controller.signal);
    await settle();
    gesture();
    expect(await preparing).toBeNull();
    expect(statuses).toEqual([{ kind: 'waiting-for-gesture' }]);
    expect(consoleError).not.toHaveBeenCalled();
  });
});
