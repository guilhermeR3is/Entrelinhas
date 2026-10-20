import * as z from 'zod/mini';
import { siteName } from '../tab-status';

export type PlayerFrame = { player: string; playerOrigin: string };

const MIN_WIDTH = 320;
const MIN_HEIGHT = 180;
const DEDICATED_HOSTS = new Set(['www.youtube.com', 'youtube.com', 'm.youtube.com']);

const FrameBoxes = z.array(z.object({ src: z.string(), width: z.number(), height: z.number() }));

export function measureFrames(): { src: string; width: number; height: number }[] {
  return Array.from(document.querySelectorAll('iframe'), (frame) => {
    const box = frame.getBoundingClientRect();
    const shown = getComputedStyle(frame).visibility !== 'hidden';
    return { src: frame.src, width: shown ? box.width : 0, height: shown ? box.height : 0 };
  });
}

export function choosePlayerFrame(measured: unknown, pageUrl: string): PlayerFrame | null {
  const frames = FrameBoxes.safeParse(measured);
  if (!frames.success || !URL.canParse(pageUrl)) return null;
  const pageHost = new URL(pageUrl).hostname;

  let chosen: { host: string; area: number } | null = null;
  for (const { src, width, height } of frames.data) {
    if (width < MIN_WIDTH || height < MIN_HEIGHT || !URL.canParse(src)) continue;
    const { protocol, hostname } = new URL(src);
    if (protocol !== 'https:' || hostname === pageHost || DEDICATED_HOSTS.has(hostname)) continue;
    const area = width * height;
    if (!chosen || area > chosen.area) chosen = { host: hostname, area };
  }
  return chosen && { player: siteName(chosen.host), playerOrigin: `https://${chosen.host}/*` };
}
