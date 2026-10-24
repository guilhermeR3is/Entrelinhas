import { readFile } from 'node:fs/promises';
import type { BrowserContext, Page } from '@playwright/test';
import { expect, test } from './fixtures';

const OVERLAY = 'projeto-bilingue-legenda';

interface WordToSave {
  word: string;
  shown: string;
  translation: string | null;
  sentence: string;
}

async function saveWords(page: Page, words: WordToSave[]): Promise<void> {
  await page.evaluate(async (entries) => {
    const runtime = (
      globalThis as unknown as {
        chrome: { runtime: { sendMessage: (message: unknown) => Promise<unknown> } };
      }
    ).chrome.runtime;
    for (const entry of entries) {
      await runtime.sendMessage({
        type: 'projeto-bilingue:save-word',
        entry: {
          ...entry,
          sentenceTranslation: null,
          videoTitle: 'Aula de inglês',
          videoUrl: 'https://www.youtube.com/watch?v=abc&t=83s',
          timeMs: 83_000,
        },
      });
    }
  }, words);
}

async function storedLevel(context: BrowserContext): Promise<unknown> {
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  return worker.evaluate(async () => {
    const stored = await (
      globalThis as unknown as {
        chrome: { storage: { local: { get(key: string): Promise<Record<string, unknown>> } } };
      }
    ).chrome.storage.local.get('highlightLevel');
    return stored.highlightLevel;
  });
}

const HOUSE = { word: 'house', shown: 'house', translation: 'casa', sentence: 'A house of cards.' };
const ZEITGEIST = {
  word: 'zeitgeist',
  shown: 'Zeitgeist',
  translation: 'espírito da época',
  sentence: 'Zeitgeist is a German word.',
};

test('says how to start when nothing was saved yet', async ({ page, vocabularyUrl }) => {
  await page.goto(vocabularyUrl);

  const status = page.getByRole('status').filter({ hasText: 'nenhuma ainda' });
  await expect(status).toContainText(
    'Clique numa palavra da legenda e escolha Salvar. Ela aparece aqui para revisar.',
  );
  await expect(page.locator('section.saved')).toBeHidden();
  await expect(page.getByRole('radio', { name: /Entendo frases simples/ })).toBeChecked();
});

test('reviews the saved words and sends the remembered ones to a later day', async ({
  page,
  vocabularyUrl,
}) => {
  await page.goto(vocabularyUrl);
  await saveWords(page, [HOUSE, ZEITGEIST]);
  await page.reload();

  await expect(page.locator('.intro')).toHaveText('2 palavras para revisar hoje. 2 salvas.');
  await expect(page.locator('.review-word')).toHaveText('house');
  await expect(page.locator('.sentence strong')).toHaveText('house');
  await expect(page.getByRole('link', { name: 'Aula de inglês · 1:23' })).toHaveAttribute(
    'href',
    'https://www.youtube.com/watch?v=abc&t=83s',
  );
  await expect(page.locator('.meaning')).toBeHidden();

  await page.getByRole('button', { name: 'Mostrar tradução' }).click();
  await expect(page.locator('.meaning')).toHaveText('casa');
  await expect(page.getByRole('button', { name: 'Lembrei · volta amanhã' })).toBeFocused();
  await page.getByRole('button', { name: 'Lembrei · volta amanhã' }).click();

  await expect(page.locator('.review-word')).toHaveText('Zeitgeist');
  await expect(page.getByRole('button', { name: 'Mostrar tradução' })).toBeFocused();
  await page.getByRole('button', { name: 'Mostrar tradução' }).click();
  await page.getByRole('button', { name: 'Não lembrei' }).click();
  await expect(page.locator('.review-word')).toHaveText('Zeitgeist');
  await expect(page.locator('.intro')).toHaveText('1 palavra para revisar hoje. 2 salvas.');

  await page.getByRole('button', { name: 'Mostrar tradução' }).click();
  await page.getByRole('button', { name: 'Lembrei · volta amanhã' }).click();
  const done = page.getByRole('status').filter({ hasText: 'em dia' });
  await expect(done).toContainText('Nenhuma palavra para hoje. A próxima volta amanhã.');
  await expect(page.locator('.saved-word')).toHaveText([
    'housecasavolta amanhãApagar',
    'Zeitgeistespírito da épocavolta amanhãApagar',
  ]);
});

test('deletes a word and exports the others in the format Anki imports', async ({
  page,
  vocabularyUrl,
}) => {
  await page.goto(vocabularyUrl);
  await saveWords(page, [HOUSE, ZEITGEIST]);
  await page.reload();
  await expect(page.locator('.letter')).toHaveText(['H', 'Z']);

  await page.getByRole('button', { name: 'Apagar house' }).click();
  await expect(page.locator('.saved-word')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Apagar Zeitgeist' })).toBeFocused();
  await expect(page.locator('.review-word')).toHaveText('Zeitgeist');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Exportar para o Anki' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('vocabulario-projeto-bilingue.csv');
  const csv = await readFile(await download.path(), 'utf8');
  expect(csv.split('\n').slice(0, 6)).toEqual([
    '#separator:Comma',
    '#html:true',
    '#tags:projeto-bilingue',
    '#guid column:1',
    '#columns:GUID,Frente,Verso',
    expect.stringMatching(/^"projeto-bilingue:zeitgeist","<b>Zeitgeist<\/b><br><b>Zeitgeist<\/b>/),
  ]);
  await expect(page.locator('.saved-status')).toContainText('No Anki, abra Arquivo › Importar');

  await page.getByRole('button', { name: 'Apagar Zeitgeist' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'nenhuma ainda' })).toBeVisible();
  await expect(page.locator('section.saved')).toBeHidden();
});

test('keeps the highlight level the person chooses', async ({ page, context, vocabularyUrl }) => {
  await page.goto(vocabularyUrl);
  await page.getByRole('radio', { name: /Estou começando/ }).check();
  await expect.poll(() => storedLevel(context)).toBe(1000);
  await page.getByRole('radio', { name: 'Desligado' }).check();
  await expect.poll(() => storedLevel(context)).toBe('off');

  await page.reload();
  await expect(page.getByRole('radio', { name: 'Desligado' })).toBeChecked();
});

test.describe('on a site', () => {
  test.beforeEach(async ({ context }) => {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    await expect
      .poll(() =>
        worker.evaluate(async () => {
          const scripts = await (
            globalThis as unknown as {
              chrome: { scripting: { getRegisteredContentScripts: () => Promise<unknown[]> } };
            }
          ).chrome.scripting.getRegisteredContentScripts();
          return scripts.length;
        }),
      )
      .toBe(1);
  });

  async function showCuesLine(page: Page): Promise<void> {
    await page.goto('/native-tracks.html?fake-translator=available');
    await expect(page.locator(OVERLAY)).toBeAttached();
    await page.evaluate(async () => {
      const video = document.querySelector('video');
      if (!video) throw new Error('No video on the page');
      const seeked = new Promise((resolve) => {
        video.addEventListener('seeked', resolve, { once: true });
      });
      video.currentTime = 2.1;
      await seeked;
    });
    await expect(page.locator(`${OVERLAY} .english`)).toHaveText('Cues can touch end to end.');
  }

  test('marks the uncommon words and follows the level chosen in the vocabulary page', async ({
    page,
    context,
    vocabularyUrl,
  }) => {
    await showCuesLine(page);
    await expect(page.locator(`${OVERLAY} .word.uncommon`)).toHaveText(['Cues']);

    const vocabulary = await context.newPage();
    await vocabulary.goto(vocabularyUrl);
    await vocabulary.getByRole('radio', { name: /Leio quase tudo/ }).check();
    await expect(page.locator(`${OVERLAY} .word.uncommon`)).toHaveText(['Cues']);
    await vocabulary.getByRole('radio', { name: 'Desligado' }).check();
    await expect(page.locator(`${OVERLAY} .word.uncommon`)).toHaveCount(0);
    await vocabulary.getByRole('radio', { name: /Estou começando/ }).check();
    await expect(page.locator(`${OVERLAY} .word.uncommon`)).toHaveText(['Cues', 'touch']);
  });

  test('a click on a word shows its translation and saves it for review', async ({
    page,
    context,
    vocabularyUrl,
  }) => {
    await showCuesLine(page);
    await page.evaluate(() => document.querySelector('video')?.play());
    await page.locator(`${OVERLAY} .word`, { hasText: 'Cues' }).click();

    const card = page.locator(`${OVERLAY} .word-card`);
    await expect(card).toBeVisible();
    expect(await page.evaluate(() => document.querySelector('video')?.paused)).toBe(true);
    await expect(card.locator('.headword')).toHaveText('Cues');
    await expect(card.locator('.word-class')).toHaveText('pouco comum');
    await expect(card.locator('.meaning')).toHaveText('[pt] cues');
    await expect(page.locator(`${OVERLAY} .word.picked`)).toHaveText('Cues');

    await card.getByRole('button', { name: 'Salvar para revisar' }).click();
    await expect(card.getByRole('button', { name: 'Salvar para revisar' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.keyboard.press('Escape');
    await expect(card).toBeHidden();
    await expect
      .poll(() => page.evaluate(() => document.querySelector('video')?.paused))
      .toBe(false);

    const vocabulary = await context.newPage();
    await vocabulary.goto(vocabularyUrl);
    await expect(vocabulary.locator('.review-word')).toHaveText('Cues');
    await expect(vocabulary.locator('.sentence')).toHaveText('Cues can touch end to end.');
    await expect(vocabulary.getByRole('link', { name: /^Native tracks · 0:0\d$/ })).toHaveAttribute(
      'href',
      /^http:\/\/localhost:4321\/native-tracks\.html/,
    );
    await vocabulary.getByRole('button', { name: 'Mostrar tradução' }).click();
    await expect(vocabulary.locator('.meaning')).toHaveText('[pt] cues');
    await expect(vocabulary.locator('.sentence-meaning')).toHaveText(
      'As falas podem encostar uma na outra.',
    );
  });
});
