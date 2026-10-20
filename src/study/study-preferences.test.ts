import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { DEFAULT_KEYS } from './study-keys';
import { DEFAULT_PREFERENCES, StudyPreferenceStore } from './study-preferences';

const storage = fakeBrowser.storage.local;

describe('StudyPreferenceStore', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('starts with the defaults when nothing was saved yet', async () => {
    const store = await StudyPreferenceStore.load(storage);
    expect(store.current).toEqual(DEFAULT_PREFERENCES);
  });

  it('brings back what was saved, one choice at a time', async () => {
    await storage.set({ speed: 0.85, blurred: true });
    const store = await StudyPreferenceStore.load(storage);
    expect(store.current).toEqual({ ...DEFAULT_PREFERENCES, speed: 0.85, blurred: true });
  });

  it('remembers a change in memory and in the storage', async () => {
    const store = await StudyPreferenceStore.load(storage);
    const placement = { x: 0.3, y: 0.1, edge: 'top' as const };
    store.remember({ placement });
    store.remember({ autoPause: true });
    expect(store.current).toMatchObject({ placement, autoPause: true });
    await vi.waitFor(async () => {
      expect(await storage.get(null)).toEqual({ placement, autoPause: true });
    });
    expect((await StudyPreferenceStore.load(storage)).current).toEqual(store.current);
  });

  it('writes only the choice that changed, so another tab keeps its own changes', async () => {
    const firstTab = await StudyPreferenceStore.load(storage);
    const secondTab = await StudyPreferenceStore.load(storage);
    firstTab.remember({ speed: 1.5 });
    secondTab.remember({ blurred: true });
    await vi.waitFor(async () => {
      expect(await storage.get(null)).toEqual({ speed: 1.5, blurred: true });
    });
  });

  it('ignores stored values that are out of range or broken, keeping the valid ones', async () => {
    await storage.set({
      speed: 7,
      autoPause: 'yes',
      blurred: true,
      placement: { x: 2, y: 0.5, edge: 'top' },
    });
    const store = await StudyPreferenceStore.load(storage);
    expect(store.current).toEqual({ ...DEFAULT_PREFERENCES, blurred: true });
  });

  it('falls back to the defaults when the storage cannot be read', async () => {
    const broken = {
      get: () => Promise.reject(new Error('storage is gone')),
      set: () => Promise.resolve(),
      onChanged: storage.onChanged,
    };
    const store = await StudyPreferenceStore.load(broken);
    expect(store.current).toEqual(DEFAULT_PREFERENCES);
    expect(store.readFailed).toBe(true);
    expect((await StudyPreferenceStore.load(storage)).readFailed).toBe(false);
  });

  it('keeps the change in memory when the storage cannot be written', async () => {
    const failing = {
      get: () => Promise.resolve({}),
      set: vi.fn(() => Promise.reject(new Error('quota'))),
      onChanged: storage.onChanged,
    };
    const store = await StudyPreferenceStore.load(failing);
    store.remember({ speed: 0.6 });
    expect(store.current.speed).toBe(0.6);
    await vi.waitFor(() => {
      expect(failing.set).toHaveBeenCalledWith({ speed: 0.6 });
    });
  });

  describe('keys', () => {
    const Q = { key: 'q', shift: false };

    it('brings back the keys chosen in the options, filling the rest with the defaults', async () => {
      await storage.set({ keys: { slower: Q } });
      const store = await StudyPreferenceStore.load(storage);
      expect(store.current.keys).toEqual({ ...DEFAULT_KEYS, slower: Q });
    });

    it('goes back to the default keys when the stored ones clash or are broken', async () => {
      await storage.set({ keys: { slower: { key: 'b', shift: false } } });
      expect((await StudyPreferenceStore.load(storage)).current.keys).toEqual(DEFAULT_KEYS);
      await storage.set({ keys: { slower: { key: 'k', shift: false } } });
      expect((await StudyPreferenceStore.load(storage)).current.keys).toEqual(DEFAULT_KEYS);
      await storage.set({ keys: { slower: 'q' } });
      expect((await StudyPreferenceStore.load(storage)).current.keys).toEqual(DEFAULT_KEYS);
    });

    it('saves and tells when the storage cannot be written, keeping the old keys', async () => {
      const store = await StudyPreferenceStore.load(storage);
      await store.save({ keys: { ...DEFAULT_KEYS, slower: Q } });
      expect(store.current.keys.slower).toEqual(Q);
      expect(await storage.get('keys')).toEqual({ keys: { ...DEFAULT_KEYS, slower: Q } });

      const failing = await StudyPreferenceStore.load({
        get: () => Promise.resolve({}),
        set: () => Promise.reject(new Error('quota')),
        onChanged: storage.onChanged,
      });
      await expect(failing.save({ keys: { ...DEFAULT_KEYS, slower: Q } })).rejects.toThrow('quota');
      expect(failing.current.keys).toEqual(DEFAULT_KEYS);
    });

    it('follows keys changed somewhere else until it is told to stop', async () => {
      const store = await StudyPreferenceStore.load(storage);
      const onKeys = vi.fn();
      const following = new AbortController();
      store.followKeys(onKeys, following.signal);

      await storage.set({ speed: 1.5 });
      await storage.set({ keys: { blur: Q } });
      expect(onKeys.mock.calls).toEqual([[{ ...DEFAULT_KEYS, blur: Q }]]);
      expect(store.current.keys.blur).toEqual(Q);

      await storage.remove('keys');
      expect(onKeys).toHaveBeenLastCalledWith(DEFAULT_KEYS);

      following.abort();
      await storage.set({ keys: { reveal: Q } });
      expect(onKeys).toHaveBeenCalledTimes(2);
    });
  });
});
