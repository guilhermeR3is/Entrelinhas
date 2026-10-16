import { createHash } from 'node:crypto';
import path from 'node:path';
import { chromium, test as base, type BrowserContext, type Page } from '@playwright/test';

const extensionPath = path.resolve('.output/chrome-mv3');

function unpackedExtensionId(directory: string): string {
  const hash = createHash('sha256').update(directory).digest('hex').slice(0, 32);
  return hash.replace(/[0-9a-f]/g, (digit) => String.fromCharCode(97 + Number.parseInt(digit, 16)));
}

export type ActiveTabStub =
  { url: string; delayMs?: number } | { rejectTimes: number; thenUrl: string };

export async function stubActiveTab(page: Page, stub: ActiveTabStub): Promise<void> {
  await page.addInitScript((tabStub: ActiveTabStub) => {
    let rejectionsLeft = 'rejectTimes' in tabStub ? tabStub.rejectTimes : 0;
    const query = async () => {
      if ('rejectTimes' in tabStub) {
        if (rejectionsLeft > 0) {
          rejectionsLeft -= 1;
          throw new Error('Simulated tabs.query failure');
        }
        return [{ url: tabStub.thenUrl }];
      }
      await new Promise((resolve) => setTimeout(resolve, tabStub.delayMs ?? 0));
      return [{ url: tabStub.url }];
    };
    const extensionApi = (globalThis as unknown as { chrome: { tabs: object } }).chrome;
    Object.defineProperty(extensionApi.tabs, 'query', { value: query });
  }, stub);
}

export const test = base.extend<{ context: BrowserContext; popupUrl: string }>({
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    });
    await use(context);
    await context.close();
  },
  popupUrl: async ({}, use) => {
    await use(`chrome-extension://${unpackedExtensionId(extensionPath)}/popup.html`);
  },
});

export const expect = test.expect;
