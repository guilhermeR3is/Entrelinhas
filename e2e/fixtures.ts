import { createHash } from 'node:crypto';
import path from 'node:path';
import { chromium, test as base, type BrowserContext, type Page } from '@playwright/test';

const extensionPath = path.resolve('.output/chrome-mv3-e2e');

function unpackedExtensionId(directory: string): string {
  const hash = createHash('sha256').update(directory).digest('hex').slice(0, 32);
  return hash.replace(/[0-9a-f]/g, (digit) => String.fromCharCode(97 + Number.parseInt(digit, 16)));
}

export interface ActiveTabStub {
  url: string;
  id?: number;
  delayMs?: number;
  rejectTimes?: number;
}

export async function stubActiveTab(page: Page, stub: ActiveTabStub): Promise<void> {
  await page.addInitScript((tabStub: ActiveTabStub) => {
    let rejectionsLeft = tabStub.rejectTimes ?? 0;
    const query = async () => {
      await new Promise((resolve) => setTimeout(resolve, tabStub.delayMs ?? 0));
      if (rejectionsLeft > 0) {
        rejectionsLeft -= 1;
        throw new Error('Simulated tabs.query failure');
      }
      return [{ url: tabStub.url, id: tabStub.id }];
    };
    const extensionApi = (globalThis as unknown as { chrome: { tabs: object } }).chrome;
    Object.defineProperty(extensionApi.tabs, 'query', { value: query });
  }, stub);
}

export interface PermissionsStub {
  granted?: string[];
  answer?: boolean;
}

export async function stubPermissions(page: Page, stub: PermissionsStub): Promise<void> {
  await page.addInitScript((permissionsStub: PermissionsStub) => {
    const granted = new Set(permissionsStub.granted ?? []);
    const calls: string[] = [];
    Object.assign(window, { permissionCalls: calls });
    const permissions = (globalThis as unknown as { chrome: { permissions: object } }).chrome
      .permissions;
    const define = (name: string, value: unknown) => {
      Object.defineProperty(permissions, name, { value });
    };
    define('getAll', () => Promise.resolve({ origins: [...granted] }));
    define('request', ({ origins = [] }: { origins?: string[] }) => {
      calls.push(`request ${origins.join()}`);
      if (permissionsStub.answer) for (const origin of origins) granted.add(origin);
      return Promise.resolve(permissionsStub.answer ?? false);
    });
    define('remove', ({ origins = [] }: { origins?: string[] }) => {
      calls.push(`remove ${origins.join()}`);
      for (const origin of origins) granted.delete(origin);
      return Promise.resolve(true);
    });
  }, stub);
}

export interface PageStub {
  frames?: { src: string; width: number; height: number }[];
  failFrames?: boolean;
}

export async function stubPage(page: Page, stub: PageStub): Promise<void> {
  await page.addInitScript((pageStub: PageStub) => {
    const reloaded: number[] = [];
    Object.assign(window, { reloadedTabs: reloaded });
    const extensionApi = (globalThis as unknown as { chrome: { scripting: object; tabs: object } })
      .chrome;
    Object.defineProperty(extensionApi.scripting, 'executeScript', {
      value: () =>
        pageStub.failFrames
          ? Promise.reject(new Error('Simulated page without access'))
          : Promise.resolve([{ frameId: 0, result: pageStub.frames ?? [] }]),
    });
    Object.defineProperty(extensionApi.tabs, 'reload', {
      value: (tabId: number) => {
        reloaded.push(tabId);
        return Promise.resolve();
      },
    });
    window.close = () => {
      document.documentElement.dataset.closed = 'true';
    };
  }, stub);
}

export async function stubTabMessages(
  page: Page,
  replies: Record<string, unknown> = {},
): Promise<void> {
  await page.addInitScript((repliesByType: Record<string, unknown>) => {
    const sent: unknown[] = [];
    Object.assign(window, { sentToTabs: sent });
    const tabs = (globalThis as unknown as { chrome: { tabs: object } }).chrome.tabs;
    Object.defineProperty(tabs, 'sendMessage', {
      value: (tabId: number, message: { type: string }) => {
        sent.push([tabId, message]);
        return Promise.resolve(repliesByType[message.type]);
      },
    });
    window.close = () => {
      document.documentElement.dataset.closed = 'true';
    };
  }, replies);
}

export const test = base.extend<{ context: BrowserContext; popupUrl: string; optionsUrl: string }>({
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
  optionsUrl: async ({}, use) => {
    await use(`chrome-extension://${unpackedExtensionId(extensionPath)}/options.html`);
  },
});

export const expect = test.expect;
