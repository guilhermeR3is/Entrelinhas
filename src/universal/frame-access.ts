import * as z from 'zod/mini';
import { browser } from 'wxt/browser';
import { logger } from '../logger';

export const MAY_RUN_IN_FRAME = { type: 'projeto-bilingue:may-run-in-frame' } as const;

const MayRunInFrame = z.object({ type: z.literal(MAY_RUN_IN_FRAME.type) });
const FrameAccessAnswer = z.object({ allowed: z.boolean() });

export function isFrameAccessRequest(message: unknown): boolean {
  return MayRunInFrame.safeParse(message).success;
}

export function pageIsAllowed(sites: readonly string[], pageUrl: string | undefined): boolean {
  if (pageUrl === undefined || !URL.canParse(pageUrl)) return false;
  const { protocol, hostname } = new URL(pageUrl);
  return sites.includes(`${protocol}//${hostname}/*`);
}

export async function mayRunInFrame(): Promise<boolean> {
  try {
    const answer: unknown = await browser.runtime.sendMessage(MAY_RUN_IN_FRAME);
    const parsed = FrameAccessAnswer.safeParse(answer);
    if (!parsed.success) logger.error('Unexpected frame access answer', answer);
    return parsed.success && parsed.data.allowed;
  } catch (error) {
    logger.error('Could not ask whether to run in this frame', error);
    return false;
  }
}
