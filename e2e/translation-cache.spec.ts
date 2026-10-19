import { expect, test } from './fixtures';

type ExtensionRuntime = { runtime: { sendMessage(message: unknown): Promise<unknown> } };

test('keeps translations in the extension database through the service worker', async ({
  context,
  popupUrl,
}) => {
  const extensionPage = await context.newPage();
  await extensionPage.goto(popupUrl);

  const answers = await extensionPage.evaluate(async () => {
    const { runtime } = (globalThis as unknown as { chrome: ExtensionRuntime }).chrome;
    const pair = { sourceLanguage: 'en', targetLanguage: 'pt' };
    const saved = await runtime.sendMessage({
      type: 'projeto-bilingue:save-translations',
      ...pair,
      translations: [{ text: 'See you tomorrow.', translation: 'Até amanhã.' }],
    });
    const found = await runtime.sendMessage({
      type: 'projeto-bilingue:find-translations',
      ...pair,
      texts: ['See you tomorrow.', 'Never translated'],
    });
    const databases = (await indexedDB.databases()).map((database) => database.name);
    return { saved, found, databases };
  });

  expect(answers).toEqual({
    saved: { saved: true },
    found: { translations: ['Até amanhã.', null] },
    databases: ['projeto-bilingue'],
  });
});
