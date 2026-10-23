import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { followSiteSwitch, isTurnedOff, turnSite } from './site-switch';

const storage = fakeBrowser.storage.local;

describe('site switch', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('keeps every site on until the person turns one off, and back on', async () => {
    expect(await isTurnedOff(storage, 'www.youtube.com')).toBe(false);

    await turnSite(storage, 'www.youtube.com', false);
    await turnSite(storage, 'cursos.example.com', false);
    expect(await isTurnedOff(storage, 'www.youtube.com')).toBe(true);
    expect(await isTurnedOff(storage, 'example.com')).toBe(false);

    await turnSite(storage, 'www.youtube.com', true);
    expect(await isTurnedOff(storage, 'www.youtube.com')).toBe(false);
    expect(await storage.get('turnedOffSites')).toEqual({
      turnedOffSites: ['cursos.example.com'],
    });
  });

  it('does not repeat a site turned off twice', async () => {
    await turnSite(storage, 'www.youtube.com', false);
    await turnSite(storage, 'www.youtube.com', false);
    expect(await storage.get('turnedOffSites')).toEqual({ turnedOffSites: ['www.youtube.com'] });
  });

  it('keeps the sites on when the stored list is not a list of sites', async () => {
    await storage.set({ turnedOffSites: { 'www.youtube.com': true } });
    expect(await isTurnedOff(storage, 'www.youtube.com')).toBe(false);

    await turnSite(storage, 'example.com', false);
    expect(await storage.get('turnedOffSites')).toEqual({ turnedOffSites: ['example.com'] });
  });

  it('keeps the sites on when the storage cannot be read', async () => {
    const broken = { ...storage, get: () => Promise.reject(new Error('storage gone')) };
    expect(await isTurnedOff(broken, 'www.youtube.com')).toBe(false);
    await expect(turnSite(broken, 'www.youtube.com', false)).rejects.toThrow('storage gone');
  });

  it('tells a page when its own site is switched, and stops telling after the abort', async () => {
    const listeners = new AbortController();
    const onSwitch = vi.fn();
    followSiteSwitch(storage, 'www.youtube.com', onSwitch, listeners.signal);

    await turnSite(storage, 'www.youtube.com', false);
    await turnSite(storage, 'example.com', false);
    await turnSite(storage, 'www.youtube.com', true);
    expect(onSwitch.mock.calls).toEqual([[true], [false]]);

    listeners.abort();
    await turnSite(storage, 'www.youtube.com', false);
    expect(onSwitch).toHaveBeenCalledTimes(2);
  });
});
