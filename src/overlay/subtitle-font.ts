import { browser } from 'wxt/browser';
import { logger } from '../logger';

const FAMILY = 'Atkinson Hyperlegible Next Variable';
const FACES = [
  { path: '/fonts/atkinson-hyperlegible-next-latin-wght-normal.woff2', style: 'normal' },
  { path: '/fonts/atkinson-hyperlegible-next-latin-wght-italic.woff2', style: 'italic' },
] as const;

export function loadSubtitleFont(fonts: FontFaceSet): void {
  for (const { path, style } of FACES) {
    const source = `url("${browser.runtime.getURL(path)}") format("woff2-variations")`;
    const face = new FontFace(FAMILY, source, { style, weight: '200 800', display: 'swap' });
    fonts.add(face);
    face.load().catch((error: unknown) => {
      logger.error('Could not load the subtitle font', error);
    });
  }
}
