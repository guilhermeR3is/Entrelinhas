import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

type StorageArea = { get(key: string): Promise<Record<string, unknown>> };

function storedKeys(page: Page): Promise<unknown> {
  return page.evaluate(async () => {
    const { local } = (globalThis as unknown as { chrome: { storage: { local: StorageArea } } })
      .chrome.storage;
    return (await local.get('keys')).keys;
  });
}

function row(page: Page, name: string) {
  return page
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name, exact: true }) });
}

test('lists every control with its default key', async ({ page, optionsUrl }) => {
  await page.goto(optionsUrl);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Atalhos do teclado');
  await expect(page.locator('.intro')).toContainText(
    'Valem no YouTube e nos sites que você ativou',
  );
  await expect(page.locator('.shortcut .name')).toHaveText([
    'Mais devagar',
    'Mais rápido',
    'Pausar no fim',
    'Repetir',
    'Repetir devagar',
    'Borrar português',
    'Mostrar português',
  ]);
  await expect(page.locator('.shortcut .key')).toHaveText([
    'Z',
    'X',
    'P',
    'R',
    'Shift+R',
    'B',
    'V',
  ]);
  await expect(page.getByRole('button', { name: 'Voltar às teclas padrão' })).toBeDisabled();
});

test('refuses keys YouTube or another control uses, then saves a free one', async ({
  page,
  optionsUrl,
}) => {
  await page.goto(optionsUrl);
  const slower = row(page, 'Mais devagar');
  await page.getByRole('button', { name: 'Trocar a tecla de Mais devagar' }).click();
  await expect(slower.locator('.message')).toHaveText('Aperte a nova tecla… Esc cancela.');
  await expect(
    page.getByRole('button', { name: 'Cancelar a troca de Mais devagar' }),
  ).toBeFocused();

  await page.keyboard.press('k');
  await expect(slower.locator('.message')).toHaveText(
    'O YouTube usa K para pausar ou continuar. Escolha outra.',
  );
  await page.keyboard.press('b');
  await expect(slower.locator('.message')).toHaveText('B já é a tecla de Borrar português.');
  await page.keyboard.press('1');
  await expect(slower.locator('.message')).toHaveText('Use uma letra, com ou sem Shift.');
  await page.keyboard.press('Enter');
  await expect(slower.locator('.message')).toHaveText('Use uma letra, com ou sem Shift.');
  await expect(slower.locator('.key')).toHaveText('Z');

  await page.keyboard.press('q');
  await expect(slower.locator('.key')).toHaveText('Q');
  await expect(slower.locator('.message')).toBeHidden();
  await expect(page.getByRole('status')).toHaveText('Mais devagar: tecla Q');
  await expect(page.getByRole('button', { name: 'Trocar a tecla de Mais devagar' })).toBeFocused();
  expect(await storedKeys(page)).toMatchObject({ slower: { key: 'q', shift: false } });

  await page.reload();
  await expect(row(page, 'Mais devagar').locator('.key')).toHaveText('Q');
  await expect(page.getByRole('button', { name: 'Voltar às teclas padrão' })).toBeEnabled();
});

test('takes a letter with Shift and cancels with Esc or by leaving with Tab', async ({
  page,
  optionsUrl,
}) => {
  await page.goto(optionsUrl);
  const blur = row(page, 'Borrar português');
  await page.getByRole('button', { name: 'Trocar a tecla de Borrar português' }).click();
  await page.keyboard.press('Shift+G');
  await expect(blur.locator('.key')).toHaveText('Shift+G');

  await page.getByRole('button', { name: 'Trocar a tecla de Borrar português' }).click();
  await page.keyboard.press('Escape');
  await expect(blur.locator('.message')).toBeHidden();
  await expect(
    page.getByRole('button', { name: 'Trocar a tecla de Borrar português' }),
  ).toBeFocused();

  await page.getByRole('button', { name: 'Trocar a tecla de Borrar português' }).click();
  await page.keyboard.press('Tab');
  await expect(blur.locator('.message')).toBeHidden();
  await expect(
    page.getByRole('button', { name: 'Trocar a tecla de Mostrar português' }),
  ).toBeFocused();
  await expect(blur.locator('.key')).toHaveText('Shift+G');
});

test('brings the default keys back', async ({ page, optionsUrl }) => {
  await page.goto(optionsUrl);
  await page.getByRole('button', { name: 'Trocar a tecla de Repetir', exact: true }).click();
  await page.keyboard.press('e');
  await expect(row(page, 'Repetir').locator('.key')).toHaveText('E');

  await page.getByRole('button', { name: 'Voltar às teclas padrão' }).click();
  await expect(row(page, 'Repetir').locator('.key')).toHaveText('R');
  await expect(page.getByRole('button', { name: 'Voltar às teclas padrão' })).toBeDisabled();
  await expect(page.getByRole('status')).toHaveText('As teclas padrão voltaram.');
});

test('keeps the old key and says so when the key cannot be saved', async ({ page, optionsUrl }) => {
  await page.addInitScript(() => {
    const { local } = (
      globalThis as unknown as { chrome: { storage: { local: Record<string, unknown> } } }
    ).chrome.storage;
    local.set = () => Promise.reject(new Error('Simulated storage failure'));
  });
  await page.goto(optionsUrl);
  const faster = row(page, 'Mais rápido');
  await page.getByRole('button', { name: 'Trocar a tecla de Mais rápido' }).click();
  await page.keyboard.press('q');
  await expect(faster.locator('.message')).toHaveText('Não deu para salvar. Tente de novo.');
  await expect(faster.locator('.key')).toHaveText('X');
});

test('shows the default keys when the saved ones cannot be read', async ({ page, optionsUrl }) => {
  await page.addInitScript(() => {
    const { local } = (
      globalThis as unknown as { chrome: { storage: { local: Record<string, unknown> } } }
    ).chrome.storage;
    local.get = () => Promise.reject(new Error('Simulated storage failure'));
  });
  await page.goto(optionsUrl);
  await expect(page.locator('.notice')).toHaveText(
    'Não deu para ler os atalhos. Mostrando as teclas padrão.',
  );
  await expect(page.locator('.shortcut .key').first()).toHaveText('Z');
});
