import * as z from 'zod/mini';
import type { browser } from 'wxt/browser';
import { logger } from '../logger';

export type SiteRule = { captionSelector: string };
export type SiteRuleStorage = Pick<typeof browser.storage.local, 'get' | 'set'>;

const STORAGE_KEY = 'siteRules';
const SiteRules = z.record(
  z.string(),
  z.object({ captionSelector: z.string().check(z.minLength(1)) }),
);

export async function readSiteRule(
  storage: SiteRuleStorage,
  host: string,
): Promise<SiteRule | null> {
  try {
    return (await readRules(storage))[host] ?? null;
  } catch (error) {
    logger.error('Could not read the site rules', error);
    return null;
  }
}

export async function saveSiteRule(
  storage: SiteRuleStorage,
  host: string,
  rule: SiteRule,
): Promise<void> {
  const rules = await readRules(storage);
  await storage.set({ [STORAGE_KEY]: { ...rules, [host]: rule } });
}

async function readRules(storage: SiteRuleStorage): Promise<Record<string, SiteRule>> {
  const stored = (await storage.get(STORAGE_KEY))[STORAGE_KEY];
  if (stored === undefined) return {};
  const rules = SiteRules.safeParse(stored);
  if (rules.success) return rules.data;
  logger.error('Ignored invalid stored site rules', rules.error);
  return {};
}
