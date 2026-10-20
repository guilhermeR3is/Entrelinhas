import type { BrowserContext, Page } from '@playwright/test';
import { expect, stubActiveTab, stubPage, stubPermissions, test } from './fixtures';

function permissionCalls(popup: Page): Promise<string[]> {
  return popup.evaluate(() => (window as unknown as { permissionCalls: string[] }).permissionCalls);
}

test('reports a page without https as unsupported with the real tabs API', async ({
  context,
  popupUrl,
}) => {
  const popup = await context.newPage();
  await popup.goto(popupUrl);

  await expect(popup.getByRole('heading', { name: 'Esta página' })).toBeVisible();
  await expect(popup.getByRole('status')).toContainText('não compatível');
  await expect(popup.getByRole('status')).toContainText('Funciona em sites com endereço https.');
  await expect(popup.locator('button:visible')).toHaveCount(0);
  await expect(popup.locator('.thumb-tab')).toBeHidden();
});

test('turns a site on after Chrome says yes, asking only for that address', async ({
  context,
  popupUrl,
}) => {
  const popup = await context.newPage();
  await stubActiveTab(popup, { url: 'https://www.example.com/aula/3' });
  await stubPermissions(popup, { answer: true });
  await popup.goto(popupUrl);

  await expect(popup.getByRole('heading', { name: 'example.com' })).toBeVisible();
  await expect(popup.getByRole('status')).toContainText('não ativado');
  await expect(popup.locator('.thumb-tab')).toBeHidden();
  await popup.getByRole('button', { name: 'Ativar neste site' }).click();

  await expect(popup.getByRole('status')).toContainText('ativado por você');
  await expect(popup.locator('.thumb-tab')).toHaveText('E');
  await expect(popup.getByRole('button', { name: 'Desativar neste site' })).toBeVisible();
  expect(await permissionCalls(popup)).toEqual(['request https://www.example.com/*']);
});

test('starts picking the caption in the tab and gets out of the way', async ({
  context,
  popupUrl,
}) => {
  const popup = await context.newPage();
  await stubActiveTab(popup, { url: 'https://www.example.com/', id: 42 });
  await stubPermissions(popup, { granted: ['https://www.example.com/*'] });
  await popup.addInitScript(() => {
    const sent: unknown[] = [];
    Object.assign(window, { sentToTabs: sent });
    const tabs = (globalThis as unknown as { chrome: { tabs: object } }).chrome.tabs;
    Object.defineProperty(tabs, 'sendMessage', {
      value: (tabId: number, message: unknown) => {
        sent.push([tabId, message]);
        return Promise.resolve({ received: true });
      },
    });
    window.close = () => {
      document.documentElement.dataset.closed = 'true';
    };
  });
  await popup.goto(popupUrl);

  await expect(popup.getByRole('button', { name: 'Escolher a legenda na tela' })).toBeVisible();
  await expect(popup.getByRole('button', { name: 'Desativar neste site' })).toHaveClass(
    /entry-link/,
  );
  await popup.getByRole('button', { name: 'Escolher a legenda na tela' }).click();

  await expect(popup.locator('html')).toHaveAttribute('data-closed', 'true');
  expect(
    await popup.evaluate(() => (window as unknown as { sentToTabs: unknown[] }).sentToTabs),
  ).toEqual([[42, { type: 'projeto-bilingue:pick-caption' }]]);
});

test('hands loading a subtitle file over to the tab', async ({ context, popupUrl }) => {
  const popup = await context.newPage();
  await stubActiveTab(popup, { url: 'https://www.example.com/', id: 42 });
  await stubPermissions(popup, { granted: ['https://www.example.com/*'] });
  await popup.addInitScript(() => {
    const sent: unknown[] = [];
    Object.assign(window, { sentToTabs: sent });
    const tabs = (globalThis as unknown as { chrome: { tabs: object } }).chrome.tabs;
    Object.defineProperty(tabs, 'sendMessage', {
      value: (tabId: number, message: unknown) => {
        sent.push([tabId, message]);
        return Promise.resolve({ received: true });
      },
    });
    window.close = () => {
      document.documentElement.dataset.closed = 'true';
    };
  });
  await popup.goto(popupUrl);

  const links = popup.locator('.entry-link:not([hidden])');
  await expect(links).toHaveText(['Carregar arquivo de legenda', 'Desativar neste site']);
  await popup.getByRole('button', { name: 'Carregar arquivo de legenda' }).click();

  await expect(popup.locator('html')).toHaveAttribute('data-closed', 'true');
  expect(
    await popup.evaluate(() => (window as unknown as { sentToTabs: unknown[] }).sentToTabs),
  ).toEqual([[42, { type: 'projeto-bilingue:load-file' }]]);
});

test('lets the person try again after saying no to Chrome', async ({ context, popupUrl }) => {
  const popup = await context.newPage();
  await stubActiveTab(popup, { url: 'https://www.example.com/' });
  await stubPermissions(popup, { answer: false });
  await popup.goto(popupUrl);

  await popup.getByRole('button', { name: 'Ativar neste site' }).click();
  await expect(popup.getByRole('status')).toContainText(
    'O Chrome ficou sem a permissão. Pode tentar de novo.',
  );
  await expect(popup.getByRole('button', { name: 'Ativar neste site' })).toBeEnabled();
});

test('turns off a site the person had turned on', async ({ context, popupUrl }) => {
  const popup = await context.newPage();
  await stubActiveTab(popup, { url: 'https://www.example.com/' });
  await stubPermissions(popup, { granted: ['https://www.example.com/*'] });
  await popup.goto(popupUrl);

  await expect(popup.getByRole('status')).toContainText('ativado por você');
  await popup.getByRole('button', { name: 'Desativar neste site' }).click();

  await expect(popup.getByRole('status')).toContainText('não ativado');
  await expect(popup.locator('.thumb-tab')).toBeHidden();
  expect(await permissionCalls(popup)).toEqual(['remove https://www.example.com/*']);
});

test('shows a site with accents as people write it, breaking long names only at the dots', async ({
  context,
  popupUrl,
}) => {
  const popup = await context.newPage();
  await stubActiveTab(popup, {
    url: 'https://www.cursosdeingles.aulasonline.xn--caf-dma.com.br/',
  });
  await stubPermissions(popup, {});
  await popup.goto(popupUrl);

  const headword = popup.getByRole('heading', { level: 1 });
  await expect(headword).toHaveText('cursosdeingles.aulasonline.café.com.br');
  const lineEndings = await headword.evaluate((element) => {
    const lines = new Map<number, string>();
    for (const node of Array.from(element.childNodes)) {
      const text = node.textContent ?? '';
      for (let index = 0; index < text.length; index += 1) {
        const range = element.ownerDocument.createRange();
        range.setStart(node, index);
        range.setEnd(node, index + 1);
        const top = Math.round(range.getBoundingClientRect().top);
        lines.set(top, (lines.get(top) ?? '') + text.charAt(index));
      }
    }
    return Array.from(lines.values(), (line) => line.at(-1));
  });
  expect(lineEndings.length).toBeGreaterThan(1);
  for (const ending of lineEndings.slice(0, -1)) expect(ending).toBe('.');
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
  await expect(popup.getByRole('heading', { name: 'Esta página' })).toBeVisible();

  const [options] = await Promise.all([
    context.waitForEvent('page'),
    popup.getByRole('link', { name: 'Atalhos do teclado' }).click(),
  ]);
  await expect(options.getByRole('heading', { level: 1 })).toHaveText('Atalhos do teclado');
  expect(new URL(options.url()).pathname).toBe('/options.html');
});

test.describe('a site whose video plays in a player of another address', () => {
  const SITE = 'https://www.cursos.com.br/*';
  const PLAYER = 'https://player.vimeo.com/*';
  const FRAMES = [
    { src: 'https://ads.example.net/slot', width: 300, height: 250 },
    { src: 'https://player.vimeo.com/video/9', width: 854, height: 480 },
  ];

  async function openPopup(
    context: BrowserContext,
    popupUrl: string,
    permissions: { granted: string[]; answer?: boolean },
    frames = FRAMES,
  ): Promise<Page> {
    const popup = await context.newPage();
    await stubActiveTab(popup, { url: 'https://www.cursos.com.br/aula/3', id: 42 });
    await stubPermissions(popup, permissions);
    await stubPage(popup, { frames });
    await popup.goto(popupUrl);
    return popup;
  }

  test('names the player and turns it on too, asking Chrome only for the player', async ({
    context,
    popupUrl,
  }) => {
    const popup = await openPopup(context, popupUrl, { granted: [SITE], answer: true });

    await expect(popup.getByRole('status')).toContainText(
      'O vídeo desta página está num player de outro endereço: player.vimeo.com.',
    );
    await expect(popup.locator('.definition strong')).toHaveText('player.vimeo.com');
    await expect(popup.locator('.thumb-tab')).toHaveText('C');
    await expect(popup.locator('.entry-link:visible')).toHaveText(['Desativar neste site']);
    await popup.getByRole('button', { name: 'Ativar também no player' }).click();

    await expect(popup.getByRole('status')).toContainText(
      'Player ativado. Recarregue a página para a legenda aparecer nele.',
    );
    expect(await permissionCalls(popup)).toEqual([`request ${PLAYER}`]);
    await popup.getByRole('button', { name: 'Recarregar a página' }).click();
    await expect(popup.locator('html')).toHaveAttribute('data-closed', 'true');
    expect(
      await popup.evaluate(() => (window as unknown as { reloadedTabs: number[] }).reloadedTabs),
    ).toEqual([42]);
  });

  test('looks for the player right after the site is turned on', async ({ context, popupUrl }) => {
    const popup = await openPopup(context, popupUrl, { granted: [], answer: true });
    await popup.getByRole('button', { name: 'Ativar neste site' }).click();

    await expect(popup.getByRole('button', { name: 'Ativar também no player' })).toBeVisible();
    expect(await permissionCalls(popup)).toEqual([`request ${SITE}`]);
  });

  test('lets the person try the player again after saying no to Chrome', async ({
    context,
    popupUrl,
  }) => {
    const popup = await openPopup(context, popupUrl, { granted: [SITE], answer: false });
    await popup.getByRole('button', { name: 'Ativar também no player' }).click();

    await expect(popup.getByRole('status')).toContainText(
      'O Chrome ficou sem a permissão do player. Pode tentar de novo.',
    );
    await expect(popup.getByRole('button', { name: 'Ativar também no player' })).toBeEnabled();
  });

  test('turns off the site and its player together', async ({ context, popupUrl }) => {
    const popup = await openPopup(context, popupUrl, { granted: [SITE, PLAYER] });
    await expect(popup.getByRole('button', { name: 'Escolher a legenda na tela' })).toBeVisible();
    await popup.getByRole('button', { name: 'Desativar neste site' }).click();

    await expect(popup.getByRole('status')).toContainText('não ativado');
    expect(await permissionCalls(popup)).toEqual([`remove ${SITE},${PLAYER}`]);
  });

  test('offers nothing more when the page has no player of another address', async ({
    context,
    popupUrl,
  }) => {
    const popup = await openPopup(context, popupUrl, { granted: [SITE] }, [
      { src: 'https://www.youtube.com/embed/abc', width: 854, height: 480 },
    ]);
    await expect(popup.getByRole('button', { name: 'Escolher a legenda na tela' })).toBeVisible();
  });
});
