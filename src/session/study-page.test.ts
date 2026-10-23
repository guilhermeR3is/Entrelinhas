import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { DEFAULT_KEYS, type StudyKeys } from '../study/study-keys';
import { prepareStudy } from './study-page';

const CHOSEN_KEYS: StudyKeys = { ...DEFAULT_KEYS, slower: { key: 'q', shift: false } };

function fakeSession() {
  return { render: vi.fn(), handleCommand: vi.fn(() => true), setKeys: vi.fn() };
}

describe('prepareStudy', () => {
  let window: JSDOM['window'];
  let listeners: AbortController;
  let context: { signal: AbortSignal; isInvalid: boolean };
  let session: ReturnType<typeof fakeSession> | undefined;

  function press(key: string): KeyboardEvent {
    const event = new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    window.document.body.dispatchEvent(event);
    return event;
  }

  function prepare() {
    return prepareStudy(window as unknown as Window, context, null, () => session);
  }

  beforeEach(() => {
    fakeBrowser.reset();
    window = new JSDOM('<body></body>').window;
    vi.stubGlobal('Element', window.Element);
    listeners = new window.AbortController();
    context = { signal: listeners.signal, isInvalid: false };
    session = undefined;
  });

  afterEach(() => {
    listeners.abort();
    vi.unstubAllGlobals();
  });

  it('sends the study keys to the session on the screen, and lets them pass without one', () => {
    prepare();
    expect(press('z').defaultPrevented).toBe(false);

    session = fakeSession();
    expect(press('z').defaultPrevented).toBe(true);
    expect(session.handleCommand).toHaveBeenCalledWith('slower');

    context.isInvalid = true;
    expect(press('z').defaultPrevented).toBe(false);
    expect(session.handleCommand).toHaveBeenCalledTimes(1);
  });

  it('listens to the stored keys and to the ones the person changes later', async () => {
    await fakeBrowser.storage.local.set({ keys: CHOSEN_KEYS });
    session = fakeSession();
    const { preferences } = prepare();
    expect((await preferences).current.keys).toEqual(CHOSEN_KEYS);
    press('q');
    expect(session.handleCommand).toHaveBeenLastCalledWith('slower');

    await fakeBrowser.storage.local.set({ keys: DEFAULT_KEYS });
    expect(session.setKeys).toHaveBeenCalledWith(DEFAULT_KEYS);
    press('z');
    expect(session.handleCommand).toHaveBeenCalledTimes(2);
  });

  it('redraws the session on the screen when the translation changes', async () => {
    session = fakeSession();
    const { translation } = prepare();
    await vi.waitFor(() => {
      expect(session?.render).toHaveBeenCalled();
    });
    expect(translation.pageStatus()).toBe('unsupported');
  });
});
