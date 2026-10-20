import { browser } from 'wxt/browser';
import { logger } from '../logger';

const SCRIPT_ID = 'universal';
const SCRIPT_FILE = '/content-scripts/universal.js';
const DEDICATED_SITES = new Set(['https://www.youtube.com/*']);

export type SiteAccessApi = Pick<typeof browser, 'permissions' | 'scripting' | 'tabs'>;

export function serveSiteAccess(api: SiteAccessApi = browser): void {
  let queue = Promise.resolve();
  const sync = (grantedNow: readonly string[] = []) => {
    queue = queue
      .then(() => syncUniversalScript(api))
      .then(() => injectIntoOpenTabs(api, grantedNow))
      .catch((error: unknown) => {
        logger.error('Could not update the sites where the extension runs', error);
      });
  };
  api.permissions.onAdded.addListener(({ origins }) => {
    sync(origins);
  });
  api.permissions.onRemoved.addListener(() => {
    sync();
  });
  sync();
}

export async function syncUniversalScript(api: SiteAccessApi): Promise<void> {
  const { origins = [] } = await api.permissions.getAll();
  const matches = universalSites(origins).sort();
  const [registered] = await api.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] });
  if (matches.length === 0) {
    if (registered) await api.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
    return;
  }
  if (registered?.matches?.join() === matches.join()) return;

  const script = {
    id: SCRIPT_ID,
    js: [SCRIPT_FILE],
    matches,
    runAt: 'document_idle' as const,
    persistAcrossSessions: true,
  };
  if (registered) await api.scripting.updateContentScripts([script]);
  else await api.scripting.registerContentScripts([script]);
}

async function injectIntoOpenTabs(api: SiteAccessApi, origins: readonly string[]): Promise<void> {
  const sites = universalSites(origins);
  if (sites.length === 0) return;
  const tabs = await api.tabs.query({ url: sites });
  const injections = await Promise.allSettled(
    tabs.flatMap((tab) =>
      tab.id === undefined
        ? []
        : [api.scripting.executeScript({ target: { tabId: tab.id }, files: [SCRIPT_FILE] })],
    ),
  );
  for (const injection of injections) {
    if (injection.status === 'rejected') {
      logger.error('Could not start the extension in an open tab', injection.reason);
    }
  }
}

function universalSites(origins: readonly string[]): string[] {
  return origins.filter((origin) => !DEDICATED_SITES.has(origin));
}
