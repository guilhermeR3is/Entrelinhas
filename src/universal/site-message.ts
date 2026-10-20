import * as z from 'zod/mini';

export const SITE_DEACTIVATED = { type: 'projeto-bilingue:site-deactivated' } as const;

const SiteDeactivated = z.object({ type: z.literal(SITE_DEACTIVATED.type) });

export function isSiteDeactivated(message: unknown): boolean {
  return SiteDeactivated.safeParse(message).success;
}
