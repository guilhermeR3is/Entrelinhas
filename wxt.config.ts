import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from 'wxt';

const MODULES = join(import.meta.dirname, 'node_modules');
const FONT_PACKAGE = '@fontsource-variable/atkinson-hyperlegible-next';
const FONTS = [
  'atkinson-hyperlegible-next-latin-wght-normal.woff2',
  'atkinson-hyperlegible-next-latin-wght-italic.woff2',
  'atkinson-hyperlegible-next-latin-ext-wght-normal.woff2',
  'atkinson-hyperlegible-next-latin-ext-wght-italic.woff2',
];
const BUNDLED_PACKAGES = [
  { name: 'zod', licenseFile: 'LICENSE' },
  { name: 'punycode', licenseFile: 'LICENSE-MIT.txt' },
  { name: FONT_PACKAGE, licenseFile: 'LICENSE' },
];

// Public key only: it pins the extension ID, so an update unzipped into another folder keeps the saved words.
const EXTENSION_KEY =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAyOHnTU1zIhSp819iPW+/UHr1feJismjkYnSJ7vjHZ48/LYt2Pc9TUxAcSEYey1sN0/nWGmmO7kkyQZzwwzTaKllxdz6bFLsJrzH1itbvSDXb4jvpuJhiT8b94TmpdbLJYWKIPhAMjhb69fWc68OrNxLUKEE+DN9gRFsWbrEjMuph8Ur1A1CydheeQQJ/1Efhakks+9ySEc/viGQs9R+XTVszxq/EdCaVyOwJ+u2CHcq4slT5wEOs/ib5z2YD+Y5qRYYSNS+PGnqmIrrTAmcfcUvD1+iuHff7qkNrSvbYodoi9TBd2+Gss2gBYwI/ClbUGxagWcn43mFozEhS28w7ZQIDAQAB';

function thirdPartyNotices(): string {
  return BUNDLED_PACKAGES.map(({ name, licenseFile }) => {
    const { version, license } = JSON.parse(
      readFileSync(join(MODULES, name, 'package.json'), 'utf8'),
    ) as { version: string; license: string };
    const text = readFileSync(join(MODULES, name, licenseFile), 'utf8').trim();
    return `${name} ${version} (${license})\n\n${text}\n`;
  }).join('\n\n');
}

export default defineConfig({
  srcDir: 'src',
  imports: false,
  manifest: ({ mode }) => {
    const testPages = mode === 'e2e' ? ['http://localhost/*', 'http://player.localhost/*'] : [];
    return {
      name: 'Entrelinhas',
      key: EXTENSION_KEY,
      permissions: ['storage', 'scripting', 'activeTab'],
      host_permissions: ['https://www.youtube.com/*', ...testPages],
      optional_host_permissions: ['https://*/*'],
      web_accessible_resources: [
        {
          resources: ['fonts/*.woff2'],
          matches: ['https://*/*', ...testPages],
          use_dynamic_url: true,
        },
      ],
    };
  },
  hooks: {
    'build:publicAssets': (_, files) => {
      for (const font of FONTS) {
        files.push({
          absoluteSrc: join(MODULES, FONT_PACKAGE, 'files', font),
          relativeDest: `fonts/${font}`,
        });
      }
      files.push({
        absoluteSrc: join(import.meta.dirname, 'LICENSE'),
        relativeDest: 'LICENSE.txt',
      });
      files.push({ contents: thirdPartyNotices(), relativeDest: 'THIRD-PARTY-NOTICES.txt' });
    },
    'prepare:publicPaths': (_, paths) => {
      paths.push(...FONTS.map((font) => `fonts/${font}`));
    },
  },
});
