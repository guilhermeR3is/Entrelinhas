import { join } from 'node:path';
import { defineConfig } from 'wxt';

const FONT_DIR = join(
  import.meta.dirname,
  'node_modules/@fontsource-variable/atkinson-hyperlegible-next/files',
);
const SUBTITLE_FONTS = [
  'atkinson-hyperlegible-next-latin-wght-normal.woff2',
  'atkinson-hyperlegible-next-latin-wght-italic.woff2',
];

export default defineConfig({
  srcDir: 'src',
  imports: false,
  manifest: {
    name: 'Projeto Bilíngue',
    permissions: ['storage'],
    host_permissions: ['https://www.youtube.com/*'],
    web_accessible_resources: [
      {
        resources: ['fonts/*.woff2'],
        matches: ['https://www.youtube.com/*'],
        use_dynamic_url: true,
      },
    ],
  },
  hooks: {
    'build:publicAssets': (_, files) => {
      for (const font of SUBTITLE_FONTS) {
        files.push({ absoluteSrc: join(FONT_DIR, font), relativeDest: `fonts/${font}` });
      }
    },
    'prepare:publicPaths': (_, paths) => {
      paths.push(...SUBTITLE_FONTS.map((font) => `fonts/${font}`));
    },
  },
});
