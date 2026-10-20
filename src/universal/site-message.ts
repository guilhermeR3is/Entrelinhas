import * as z from 'zod/mini';

export const SITE_DEACTIVATED = { type: 'projeto-bilingue:site-deactivated' } as const;
export const PICK_CAPTION = { type: 'projeto-bilingue:pick-caption' } as const;

const SiteMessage = z.discriminatedUnion('type', [
  z.object({ type: z.literal(SITE_DEACTIVATED.type) }),
  z.object({ type: z.literal(PICK_CAPTION.type) }),
]);

export type SiteMessageType = z.infer<typeof SiteMessage>['type'];

export function readSiteMessage(message: unknown): SiteMessageType | null {
  const parsed = SiteMessage.safeParse(message);
  return parsed.success ? parsed.data.type : null;
}
