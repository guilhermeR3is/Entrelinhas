import { expect, stubActiveTab, test } from './fixtures';

test('reports an unsupported site with the real tabs API', async ({ context, popupUrl }) => {
  const popup = await context.newPage();
  await popup.goto(popupUrl);

  await expect(popup.getByRole('heading', { name: 'Este site' })).toBeVisible();
  await expect(popup.getByRole('status')).toContainText('site não suportado');
  await expect(popup.getByRole('status')).toContainText('Por enquanto, só no YouTube.');
  await expect(popup.getByRole('button', { name: 'Tentar de novo' })).toBeHidden();
  await expect(popup.locator('.thumb-tab')).toBeHidden();
});

test('reports YouTube as active and lights the thumb tab', async ({ context, popupUrl }) => {
  const popup = await context.newPage();
  await stubActiveTab(popup, { url: 'https://www.youtube.com/watch?v=abc' });
  await popup.goto(popupUrl);

  await expect(popup.getByRole('heading', { name: 'youtube.com' })).toBeVisible();
  await expect(popup.getByRole('status')).toContainText('Ativa neste site.');
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
  await stubActiveTab(popup, { rejectTimes: 1, thenUrl: 'https://www.youtube.com/' });
  await popup.goto(popupUrl);

  await expect(popup.getByRole('status')).toContainText('Não deu para verificar agora.');
  await expect(popup.locator('.thumb-tab')).toBeHidden();

  await popup.getByRole('button', { name: 'Tentar de novo' }).click();

  await expect(popup.getByRole('heading', { name: 'youtube.com' })).toBeVisible();
  await expect(popup.getByRole('button', { name: 'Tentar de novo' })).toBeHidden();
});
