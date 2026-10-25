import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const SIZES = [16, 32, 48, 128];
const scriptDir = import.meta.dirname;
const iconDir = join(scriptDir, '..', 'public', 'icon');

const svg = await readFile(join(scriptDir, 'icon.svg'), 'utf8');

// The outline must stay one device pixel wide at every size, or it vanishes at 16 px and turns heavy at 128 px.
function sized(source: string, size: number): string {
  const half = 8 / size;
  const rule = `<rect id="rule" x="${String(half)}" y="${String(2 + half)}" width="${String(16 - 2 * half)}" height="${String(12 - 2 * half)}" rx="${String(1 - half)}" fill="none" stroke="#7e838b" stroke-width="${String(2 * half)}"/>`;
  return source
    .replace('<svg ', `<svg width="${String(size)}" height="${String(size)}" `)
    .replace(/<rect id="rule"[^>]*\/>/, rule);
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  for (const size of SIZES) {
    await page.setContent(`<body style="margin:0">${sized(svg, size)}</body>`);
    await page
      .locator('svg')
      .screenshot({ path: join(iconDir, `${String(size)}.png`), omitBackground: true });
  }
} finally {
  await browser.close();
}
