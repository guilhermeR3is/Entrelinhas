import * as z from 'zod/mini';
import type { browser } from 'wxt/browser';
import { logger } from './logger';

export type SiteSwitchStorage = Pick<typeof browser.storage.local, 'get' | 'set' | 'onChanged'>;

const STORAGE_KEY = 'turnedOffSites';
const TurnedOffSites = z.array(z.string());

export async function isTurnedOff(storageArea: SiteSwitchStorage, host: string): Promise<boolean> {
  try {
    return (await readTurnedOff(storageArea)).includes(host);
  } catch (error) {
    logger.error('Could not read the sites turned off', error);
    return false;
  }
}

export async function turnSite(
  storageArea: SiteSwitchStorage,
  host: string,
  on: boolean,
): Promise<void> {
  const others = (await readTurnedOff(storageArea)).filter((site) => site !== host);
  await storageArea.set({ [STORAGE_KEY]: on ? others : [...others, host] });
}

export function followSiteSwitch(
  storageArea: SiteSwitchStorage,
  host: string,
  onSwitch: (turnedOff: boolean) => void,
  signal: AbortSignal,
): void {
  const listener = (changes: Record<string, { oldValue?: unknown; newValue?: unknown }>): void => {
    const change = changes[STORAGE_KEY];
    if (!change) return;
    const wasOff = parseTurnedOff(change.oldValue).includes(host);
    const isOff = parseTurnedOff(change.newValue).includes(host);
    if (wasOff !== isOff) onSwitch(isOff);
  };
  storageArea.onChanged.addListener(listener);
  signal.addEventListener('abort', () => {
    storageArea.onChanged.removeListener(listener);
  });
}

async function readTurnedOff(storageArea: SiteSwitchStorage): Promise<string[]> {
  return parseTurnedOff((await storageArea.get(STORAGE_KEY))[STORAGE_KEY]);
}

function parseTurnedOff(stored: unknown): string[] {
  if (stored === undefined) return [];
  const sites = TurnedOffSites.safeParse(stored);
  if (sites.success) return sites.data;
  logger.error('Ignored an invalid list of sites turned off', sites.error);
  return [];
}
