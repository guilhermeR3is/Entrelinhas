import { describe, expect, it, vi } from 'vitest';
import { serveSiteAccess, syncUniversalScript, type SiteAccessApi } from './site-access';

type Script = { id: string; matches?: string[] };
type PermissionListener = (permissions: { origins?: string[] }) => void;

function fakeApi(origins: string[], registered: Script[] = []) {
  const listeners = { added: [] as PermissionListener[], removed: [] as PermissionListener[] };
  const scripts = [...registered];
  const api = {
    permissions: {
      getAll: vi.fn(() => Promise.resolve({ origins })),
      onAdded: { addListener: (listener: PermissionListener) => listeners.added.push(listener) },
      onRemoved: {
        addListener: (listener: PermissionListener) => listeners.removed.push(listener),
      },
    },
    scripting: {
      getRegisteredContentScripts: vi.fn(() => Promise.resolve([...scripts])),
      registerContentScripts: vi.fn((added: Script[]) => {
        scripts.push(...added);
        return Promise.resolve();
      }),
      updateContentScripts: vi.fn((updated: Script[]) => {
        scripts.splice(0, scripts.length, ...updated);
        return Promise.resolve();
      }),
      unregisterContentScripts: vi.fn(() => {
        scripts.splice(0);
        return Promise.resolve();
      }),
      executeScript: vi.fn(() => Promise.resolve([])),
    },
    tabs: { query: vi.fn(() => Promise.resolve([{ id: 7 }, { id: 9 }])) },
  };
  return { api, listeners, scripts, siteAccess: api as unknown as SiteAccessApi };
}

describe('syncUniversalScript', () => {
  it('registers the universal script for the sites the person allowed, not YouTube', async () => {
    const { siteAccess, scripts } = fakeApi([
      'https://www.youtube.com/*',
      'https://www.example.com/*',
      'https://aulas.dev/*',
    ]);
    await syncUniversalScript(siteAccess);
    expect(scripts).toEqual([
      expect.objectContaining({
        id: 'universal',
        js: ['/content-scripts/universal.js'],
        matches: ['https://aulas.dev/*', 'https://www.example.com/*'],
        persistAcrossSessions: true,
      }),
    ]);
  });

  it('registers nothing while only YouTube is allowed', async () => {
    const { siteAccess, api } = fakeApi(['https://www.youtube.com/*']);
    await syncUniversalScript(siteAccess);
    expect(api.scripting.registerContentScripts).not.toHaveBeenCalled();
  });

  it('leaves the script alone when the sites did not change', async () => {
    const { siteAccess, api } = fakeApi(
      ['https://www.example.com/*'],
      [{ id: 'universal', matches: ['https://www.example.com/*'] }],
    );
    await syncUniversalScript(siteAccess);
    expect(api.scripting.updateContentScripts).not.toHaveBeenCalled();
    expect(api.scripting.registerContentScripts).not.toHaveBeenCalled();
  });

  it('updates the sites of a script that is already registered', async () => {
    const { siteAccess, scripts } = fakeApi(
      ['https://aulas.dev/*', 'https://www.example.com/*'],
      [{ id: 'universal', matches: ['https://www.example.com/*'] }],
    );
    await syncUniversalScript(siteAccess);
    expect(scripts.map((script) => script.matches)).toEqual([
      ['https://aulas.dev/*', 'https://www.example.com/*'],
    ]);
  });

  it('unregisters the script when the last site is removed', async () => {
    const { siteAccess, scripts } = fakeApi(
      ['https://www.youtube.com/*'],
      [{ id: 'universal', matches: ['https://www.example.com/*'] }],
    );
    await syncUniversalScript(siteAccess);
    expect(scripts).toEqual([]);
  });
});

describe('serveSiteAccess', () => {
  it('starts the extension in the open tabs of a site the person just allowed', async () => {
    const origins = ['https://www.youtube.com/*'];
    const { siteAccess, api, listeners, scripts } = fakeApi(origins);
    serveSiteAccess(siteAccess);
    origins.push('https://www.example.com/*');
    for (const listener of listeners.added) listener({ origins: ['https://www.example.com/*'] });

    await vi.waitFor(() => {
      expect(api.scripting.executeScript).toHaveBeenCalledTimes(2);
    });
    expect(api.tabs.query).toHaveBeenCalledWith({ url: ['https://www.example.com/*'] });
    expect(api.scripting.executeScript).toHaveBeenCalledWith({
      target: { tabId: 7 },
      files: ['/content-scripts/universal.js'],
    });
    expect(scripts.map((script) => script.matches)).toEqual([['https://www.example.com/*']]);
  });

  it('keeps the other tabs when one of them refuses the script', async () => {
    const { siteAccess, api, listeners } = fakeApi(['https://www.example.com/*']);
    api.scripting.executeScript.mockRejectedValueOnce(new Error('Tab was discarded'));
    serveSiteAccess(siteAccess);
    for (const listener of listeners.added) listener({ origins: ['https://www.example.com/*'] });
    await vi.waitFor(() => {
      expect(api.scripting.executeScript).toHaveBeenCalledTimes(2);
    });
  });

  it('removes the script when the person takes the permission back', async () => {
    const origins = ['https://www.example.com/*'];
    const { siteAccess, listeners, scripts } = fakeApi(origins);
    serveSiteAccess(siteAccess);
    await vi.waitFor(() => {
      expect(scripts).toHaveLength(1);
    });

    origins.pop();
    for (const listener of listeners.removed) listener({ origins: ['https://www.example.com/*'] });
    await vi.waitFor(() => {
      expect(scripts).toEqual([]);
    });
  });
});
