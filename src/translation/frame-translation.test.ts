import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  frameTranslatorApi,
  relayFrameTranslation,
  servePageTranslation,
} from './frame-translation';
import { PortugueseTranslation } from './portuguese-translation';
import type { TranslatorApi, TranslatorAvailability } from './translator-api';

type Listener = (
  message: unknown,
  sender: { tab?: { id?: number }; frameId?: number },
  sendResponse: (response: unknown) => void,
) => boolean;

const PAIR = { sourceLanguage: 'en', targetLanguage: 'pt' };
const STATUS = { type: 'projeto-bilingue:page-translator-status' };
const TRANSLATE = { type: 'projeto-bilingue:translate-for-frame', text: 'Hello.' };

function fakeRelay(answer: () => Promise<unknown>) {
  const listeners: Listener[] = [];
  const sendMessage = vi.fn(answer);
  const api = {
    runtime: { onMessage: { addListener: (listener: Listener) => listeners.push(listener) } },
    tabs: { sendMessage },
  };
  relayFrameTranslation(api as unknown as Parameters<typeof relayFrameTranslation>[0]);
  const send = async (message: unknown, sender: { tab?: { id?: number }; frameId?: number }) => {
    const sendResponse = vi.fn();
    const kept = listeners.map((listener) => listener(message, sender, sendResponse));
    if (kept.some(Boolean)) {
      await vi.waitFor(() => {
        expect(sendResponse).toHaveBeenCalled();
      });
    }
    return { kept, sendResponse };
  };
  return { send, sendMessage };
}

describe('relayFrameTranslation', () => {
  it('passes the question of a player to the page at the top of its tab', async () => {
    const { send, sendMessage } = fakeRelay(() => Promise.resolve({ translation: 'Olá.' }));
    const { sendResponse } = await send(TRANSLATE, { tab: { id: 7 }, frameId: 3 });
    expect(sendMessage).toHaveBeenCalledWith(7, TRANSLATE, { frameId: 0 });
    expect(sendResponse).toHaveBeenCalledWith({ translation: 'Olá.' });
  });

  it('answers for the page when it cannot be reached yet', async () => {
    const { send } = fakeRelay(() => Promise.reject(new Error('Receiving end does not exist')));
    const status = await send(STATUS, { tab: { id: 7 }, frameId: 3 });
    expect(status.sendResponse).toHaveBeenCalledWith({ status: 'preparing' });
    const translation = await send(TRANSLATE, { tab: { id: 7 }, frameId: 3 });
    expect(translation.sendResponse).toHaveBeenCalledWith({ failed: true });
  });

  it('never sends the page its own question back', async () => {
    const { send, sendMessage } = fakeRelay(() => Promise.resolve({ status: 'ready' }));
    const { sendResponse } = await send(STATUS, { tab: { id: 7 }, frameId: 0 });
    expect(sendMessage).not.toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith({ status: 'preparing' });
  });

  it('leaves other messages to their own listeners', async () => {
    const { send, sendMessage } = fakeRelay(() => Promise.resolve({}));
    const { kept } = await send({ type: 'projeto-bilingue:pick-caption' }, { tab: { id: 7 } });
    expect(kept).toEqual([false]);
    expect(sendMessage).not.toHaveBeenCalled();
  });
});

describe('a player translating through the page around it', () => {
  let stop: AbortController;

  beforeEach(() => {
    fakeBrowser.reset();
    vi.stubGlobal('indexedDB', new IDBFactory());
    stop = new AbortController();
  });

  afterEach(() => {
    stop.abort();
    vi.unstubAllGlobals();
  });

  function pageApi(
    availability: TranslatorAvailability,
    translate = (text: string) => `pt:${text}`,
  ) {
    const api: TranslatorApi = {
      availability: () => Promise.resolve(availability),
      create: () =>
        Promise.resolve({
          translate: (text) => Promise.resolve(translate(text)),
          destroy: () => undefined,
        }),
    };
    return api;
  }

  async function servingPage(api: TranslatorApi): Promise<void> {
    const translation = new PortugueseTranslation(() => undefined);
    await translation.prepare(api, new EventTarget(), stop.signal);
    servePageTranslation(translation, stop.signal);
  }

  it('uses the translator of the page once it is ready', async () => {
    await servingPage(pageApi('available'));
    const api = frameTranslatorApi();
    expect(await api.availability(PAIR)).toBe('available');
    const translator = await api.create({ ...PAIR, signal: stop.signal });
    expect(await translator.translate('Hello.')).toBe('pt:Hello.');
  });

  it('reports no translation when the page has none', async () => {
    await servingPage(pageApi('unavailable'));
    expect(await frameTranslatorApi().availability(PAIR)).toBe('unavailable');
    await expect(frameTranslatorApi().create({ ...PAIR, signal: stop.signal })).rejects.toThrow(
      'The page translator is unsupported',
    );
  });

  it('fails the line when the page could not translate it', async () => {
    await servingPage(
      pageApi('available', () => {
        throw new Error('Model crashed');
      }),
    );
    const translator = await frameTranslatorApi().create({ ...PAIR, signal: stop.signal });
    await expect(translator.translate('Hello.')).rejects.toThrow(
      'The page could not translate for the player',
    );
  });

  it('stops listening when the page goes away', async () => {
    await servingPage(pageApi('available'));
    stop.abort();
    stop = new AbortController();
    expect(fakeBrowser.runtime.onMessage.hasListeners()).toBe(false);
  });
});
