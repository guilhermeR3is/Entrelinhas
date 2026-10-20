import { expect, stubActiveTab, test } from './fixtures';

test('reports an unsupported site with the real tabs API', async ({ context, popupUrl }) => {
  const popup = await context.newPage();
  await popup.goto(popupUrl);

  await expect(popup.getByRole('heading', { name: 'Este site' })).toBeVisible();
  await expect(popup.getByRole('status')).toContainText('não compatível');
  await expect(popup.getByRole('status')).toContainText('Por enquanto, só funciona no YouTube.');
  await expect(popup.getByRole('button', { name: 'Tentar de novo' })).toBeHidden();
  await expect(popup.locator('.thumb-tab')).toBeHidden();
});

test('reports YouTube as active and lights the thumb tab', async ({ context, popupUrl }) => {
  const popup = await context.newPage();
  await stubActiveTab(popup, { url: 'https://www.youtube.com/watch?v=abc' });
  await popup.goto(popupUrl);

  await expect(popup.getByRole('heading', { name: 'youtube.com' })).toBeVisible();
  await expect(popup.getByRole('status')).toContainText('Ativa aqui.');
  await expect(popup.locator('.thumb-tab')).toHaveAttribute('data-state', 'lit');
  await expect(popup.locator('.thumb-tab')).toHaveText('Y');
});

test('shows a checking notice when the tab takes long to answer', async ({ context, popupUrl }) => {
  const popup = await context.newPage();
  await stubActiveTab(popup, { url: 'https://www.youtube.com/', delayMs: 800 });
  await popup.goto(popupUrl);

  await expect(popup.getByText('Verificando esta aba…')).toBeVisible();
  await expect(popup.getByRole('heading', { name: 'youtube.com' })).toBeVisible();
  await expect(popup.getByText('Verificando esta aba…')).toBeHidden();
});

test('recovers from a failed check through the retry button', async ({ context, popupUrl }) => {
  const popup = await context.newPage();
  await stubActiveTab(popup, { url: 'https://www.youtube.com/', rejectTimes: 1 });
  await popup.goto(popupUrl);

  await expect(popup.getByRole('status')).toContainText('Não deu para verificar agora.');
  await expect(popup.locator('.thumb-tab')).toBeHidden();

  await popup.getByRole('button', { name: 'Tentar de novo' }).click();

  await expect(popup.getByRole('heading', { name: 'youtube.com' })).toBeVisible();
  await expect(popup.getByRole('button', { name: 'Tentar de novo' })).toBeHidden();
});

test('keeps the error in place while retrying and keeps focus on retry', async ({
  context,
  popupUrl,
}) => {
  const popup = await context.newPage();
  await stubActiveTab(popup, { url: 'https://www.youtube.com/', rejectTimes: 2, delayMs: 300 });
  await popup.goto(popupUrl);
  const retry = popup.getByRole('button', { name: 'Tentar de novo' });
  await expect(retry).toBeVisible();

  await retry.click();
  await expect(retry).toBeDisabled();
  await expect(popup.getByRole('heading', { name: 'Esta aba' })).toBeVisible();

  await expect(retry).toBeEnabled();
  await expect(retry).toBeFocused();

  await popup.keyboard.press('Enter');
  await expect(popup.getByRole('heading', { name: 'youtube.com' })).toBeVisible();
});

test('opens the shortcuts page from the link at the foot of the popup', async ({
  context,
  popupUrl,
}) => {
  const popup = await context.newPage();
  await popup.addInitScript(() => {
    window.open = () => null;
  });
  await popup.goto(popupUrl);
  await expect(popup.getByRole('heading', { name: 'Este site' })).toBeVisible();

  const [options] = await Promise.all([
    context.waitForEvent('page'),
    popup.getByRole('link', { name: 'Atalhos do teclado' }).click(),
  ]);
  await expect(options.getByRole('heading', { level: 1 })).toHaveText('Atalhos do teclado');
  expect(new URL(options.url()).pathname).toBe('/options.html');
});
