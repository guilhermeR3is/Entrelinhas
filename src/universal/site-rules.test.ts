import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { readSiteRule, saveSiteRule } from './site-rules';

describe('site rules', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('has no rule for a site nobody taught yet', async () => {
    expect(await readSiteRule(fakeBrowser.storage.local, 'aulas.example.com')).toBeNull();
  });

  it('remembers the caption of each site by its address', async () => {
    const storage = fakeBrowser.storage.local;
    await saveSiteRule(storage, 'aulas.example.com', { captionSelector: '.fp-captions span' });
    await saveSiteRule(storage, 'www.cursos.dev', { captionSelector: '#subtitle' });
    expect(await readSiteRule(storage, 'aulas.example.com')).toEqual({
      captionSelector: '.fp-captions span',
    });
    expect(await readSiteRule(storage, 'www.cursos.dev')).toEqual({ captionSelector: '#subtitle' });
  });

  it('replaces the rule when the person teaches the same site again', async () => {
    const storage = fakeBrowser.storage.local;
    await saveSiteRule(storage, 'aulas.example.com', { captionSelector: '.old' });
    await saveSiteRule(storage, 'aulas.example.com', { captionSelector: '.new' });
    expect(await readSiteRule(storage, 'aulas.example.com')).toEqual({ captionSelector: '.new' });
  });

  it('ignores rules that were stored broken', async () => {
    const storage = fakeBrowser.storage.local;
    await storage.set({ siteRules: { 'aulas.example.com': { captionSelector: '' } } });
    expect(await readSiteRule(storage, 'aulas.example.com')).toBeNull();
  });

  it('reads no rule when the storage fails, and does not overwrite the rules when saving fails', async () => {
    const storage = {
      get: vi.fn(() => Promise.reject(new Error('storage is gone'))),
      set: vi.fn(() => Promise.resolve()),
    };
    expect(await readSiteRule(storage, 'aulas.example.com')).toBeNull();
    await expect(
      saveSiteRule(storage, 'aulas.example.com', { captionSelector: '.new' }),
    ).rejects.toThrow('storage is gone');
    expect(storage.set).not.toHaveBeenCalled();
  });
});
