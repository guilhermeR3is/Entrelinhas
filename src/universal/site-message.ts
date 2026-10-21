import * as z from 'zod/mini';

export const SITE_DEACTIVATED = { type: 'projeto-bilingue:site-deactivated' } as const;
export const PICK_CAPTION = { type: 'projeto-bilingue:pick-caption' } as const;
export const LOAD_FILE = { type: 'projeto-bilingue:load-file' } as const;
export const SITE_PROBLEM = { type: 'projeto-bilingue:site-problem' } as const;

const SiteMessage = z.discriminatedUnion('type', [
  z.object({ type: z.literal(SITE_DEACTIVATED.type) }),
  z.object({ type: z.literal(PICK_CAPTION.type) }),
  z.object({ type: z.literal(LOAD_FILE.type) }),
  z.object({ type: z.literal(SITE_PROBLEM.type) }),
]);

const SiteProblemReply = z.object({
  problem: z.enum(['stopped', 'learned-caption-missing']),
});

export type SiteProblem = z.infer<typeof SiteProblemReply>['problem'];

export type SiteMessageType = z.infer<typeof SiteMessage>['type'];

export function readSiteMessage(message: unknown): SiteMessageType | null {
  const parsed = SiteMessage.safeParse(message);
  return parsed.success ? parsed.data.type : null;
}

export function readSiteProblem(reply: unknown): SiteProblem | null {
  const parsed = SiteProblemReply.safeParse(reply);
  return parsed.success ? parsed.data.problem : null;
}
