import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test, type BrowserContext } from '@playwright/test';
import { extensionIdFromKey, extensionPath, launchWithExtension } from './fixtures';

async function serviceWorker(context: BrowserContext) {
  return context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
}

async function loadedExtensionId(directory: string): Promise<string> {
  const context = await launchWithExtension(directory);
  try {
    return new URL((await serviceWorker(context)).url()).host;
  } finally {
    await context.close();
  }
}

type LocalStorage = {
  chrome: {
    storage: {
      local: {
        set: (items: object) => Promise<void>;
        get: (key: string) => Promise<Record<string, unknown>>;
      };
    };
  };
};

test('keeps the same extension id when the files are unzipped into another folder', async () => {
  const otherFolder = await mkdtemp(path.join(tmpdir(), 'entrelinhas-'));
  try {
    await cp(extensionPath, otherFolder, { recursive: true });

    const expected = extensionIdFromKey(extensionPath);
    expect(await loadedExtensionId(extensionPath)).toBe(expected);
    expect(await loadedExtensionId(otherFolder)).toBe(expected);
  } finally {
    await rm(otherFolder, { recursive: true, force: true });
  }
});

test('keeps what the person saved when an update is loaded from another folder', async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'entrelinhas-'));
  const profile = path.join(workspace, 'profile');
  const newVersion = path.join(workspace, 'new-version');
  try {
    await cp(extensionPath, newVersion, { recursive: true });

    const before = await launchWithExtension(extensionPath, profile);
    const oldWorker = await serviceWorker(before);
    await oldWorker.evaluate(() =>
      (globalThis as unknown as LocalStorage).chrome.storage.local.set({
        updateCheck: 'saved before the update',
      }),
    );
    await before.close();

    const after = await launchWithExtension(newVersion, profile);
    try {
      const newWorker = await serviceWorker(after);
      const kept = await newWorker.evaluate(async () => {
        const stored = await (globalThis as unknown as LocalStorage).chrome.storage.local.get(
          'updateCheck',
        );
        return stored.updateCheck;
      });
      expect(kept).toBe('saved before the update');
    } finally {
      await after.close();
    }
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
