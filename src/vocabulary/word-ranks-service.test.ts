import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { loadWordRanks, serveWordRanks } from './word-ranks-service';

describe('serveWordRanks', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reads the list once and hands it to every content script that asks', async () => {
    const readList = vi.fn(() => Promise.resolve('the\nyou\nzeitgeist\n'));
    serveWordRanks(readList);

    const first = await loadWordRanks();
    const second = await loadWordRanks();

    expect(first?.get('zeitgeist')).toBe(3);
    expect(second?.size).toBe(3);
    expect(readList).toHaveBeenCalledTimes(1);
  });

  it('leaves other messages unanswered', async () => {
    serveWordRanks(() => Promise.resolve('the\n'));

    expect(await fakeBrowser.runtime.sendMessage({ type: 'something-else' })).toBeUndefined();
  });

  it('answers with a failure and reads the list again on the next request', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const readList = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('missing file'))
      .mockResolvedValue('the\n');
    serveWordRanks(readList);

    expect(await fakeBrowser.runtime.sendMessage({ type: 'projeto-bilingue:word-ranks' })).toEqual({
      failed: true,
    });
    expect((await loadWordRanks())?.get('the')).toBe(1);
  });
});

describe('loadWordRanks', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('gives up without the service worker or with an unexpected answer', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await loadWordRanks()).toBeNull();

    fakeBrowser.runtime.onMessage.addListener((_message, _sender, sendResponse) => {
      sendResponse({ words: '' });
      return true;
    });
    expect(await loadWordRanks()).toBeNull();
  });
});
