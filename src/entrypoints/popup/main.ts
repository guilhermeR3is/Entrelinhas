import '@fontsource-variable/atkinson-hyperlegible-next/wght.css';
import '@fontsource-variable/atkinson-hyperlegible-next/wght-italic.css';
import './style.css';
import { browser } from 'wxt/browser';
import { logger } from '../../logger';
import { tabStatusFromUrl } from '../../tab-status';
import { LOAD_FILE, PICK_CAPTION, SITE_DEACTIVATED } from '../../universal/site-message';
import { ACTION_LABELS, entryFor, thumbTabLetter, type EntryState } from './entry';

type SiteState = Extract<EntryState, { origin: string }>;
type CurrentTab = { state: EntryState; tabId: number | undefined };

const SLOW_CHECK_NOTICE_MS = 150;
const REVEAL_EASING = 'cubic-bezier(0.23, 1, 0.32, 1)';
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function element(selector: string): HTMLElement {
  const found = document.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`Popup element ${selector} not found`);
  return found;
}

const checking = element('.checking');
const entry = element('.entry');
const headword = element('.headword');
const wordClass = element('.word-class');
const definition = element('.definition');
const action = element('.entry-action');
const actionLinks = Array.from(document.querySelectorAll<HTMLElement>('.entry-link'));
const thumbTab = element('.thumb-tab');
const shortcutsLink = element('.shortcuts-link');
let current: CurrentTab = { state: { kind: 'error' }, tabId: undefined };

function reveal(): void {
  const from = reducedMotion.matches
    ? { opacity: 0 }
    : { opacity: 0, transform: 'translateY(4px)' };
  entry.animate([from, { opacity: 1, transform: 'none' }], {
    duration: 160,
    easing: REVEAL_EASING,
  });
}

function breakAtDots(text: string): Node[] {
  const parts = text.split('.');
  return parts.flatMap((part, index) =>
    index < parts.length - 1
      ? [document.createTextNode(`${part}.`), document.createElement('wbr')]
      : [document.createTextNode(part)],
  );
}

function setBusy(busy: boolean): void {
  for (const control of [action, ...actionLinks]) {
    control.toggleAttribute('disabled', busy);
    if (busy) control.setAttribute('aria-busy', 'true');
    else control.removeAttribute('aria-busy');
  }
}

function show(state: EntryState, { animate }: { animate: boolean }): void {
  current = { ...current, state };
  const view = entryFor(state);
  headword.replaceChildren(...breakAtDots(view.headword));
  wordClass.textContent = view.wordClass;
  definition.textContent = view.definition;
  thumbTab.dataset.state = view.thumbTab;
  thumbTab.textContent = view.thumbTab === 'lit' ? thumbTabLetter(view.headword) : '';
  action.hidden = view.action === null;
  action.dataset.action = view.action ?? '';
  action.textContent = view.action ? ACTION_LABELS[view.action] : '';
  actionLinks.forEach((link, index) => {
    const linkAction = view.links[index];
    link.hidden = linkAction === undefined;
    link.dataset.action = linkAction ?? '';
    link.textContent = linkAction ? ACTION_LABELS[linkAction] : '';
  });
  setBusy(false);
  checking.hidden = true;
  entry.hidden = false;
  if (animate) reveal();
}

async function firstCheck(): Promise<void> {
  const slowNotice = setTimeout(() => {
    checking.hidden = false;
  }, SLOW_CHECK_NOTICE_MS);

  try {
    const tab = await readCurrentTab();
    current = tab;
    show(tab.state, { animate: !checking.hidden });
  } finally {
    clearTimeout(slowNotice);
  }
}

async function recheck(): Promise<void> {
  setBusy(true);
  const tab = await readCurrentTab();
  current = tab;
  show(tab.state, { animate: tab.state.kind !== 'error' });
  if (tab.state.kind === 'error') action.focus();
}

async function readCurrentTab(): Promise<CurrentTab> {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    const { origins = [] } = await browser.permissions.getAll();
    return { state: tabStatusFromUrl(tab?.url, origins), tabId: tab?.id };
  } catch (error) {
    logger.error('Could not read the active tab', error);
    return { state: { kind: 'error' }, tabId: undefined };
  }
}

async function activate({ site, origin }: SiteState): Promise<void> {
  setBusy(true);
  try {
    const granted = await browser.permissions.request({ origins: [origin] });
    show({ kind: granted ? 'enabled' : 'denied', site, origin }, { animate: true });
  } catch (error) {
    logger.error('Could not ask Chrome for the site', error);
    show({ kind: 'error' }, { animate: true });
  }
}

async function deactivate({ site, origin }: SiteState): Promise<void> {
  setBusy(true);
  try {
    await browser.permissions.remove({ origins: [origin] });
  } catch (error) {
    logger.error('Could not turn the site off', error);
    show({ kind: 'error' }, { animate: true });
    return;
  }
  if (current.tabId !== undefined) {
    browser.tabs.sendMessage(current.tabId, SITE_DEACTIVATED).catch((error: unknown) => {
      logger.error('Could not reach the open tab', error);
    });
  }
  show({ kind: 'available', site, origin }, { animate: true });
}

async function handOverToTab(message: typeof PICK_CAPTION | typeof LOAD_FILE): Promise<void> {
  const { tabId } = current;
  if (tabId === undefined) {
    show({ kind: 'error' }, { animate: true });
    return;
  }
  setBusy(true);
  try {
    await browser.tabs.sendMessage(tabId, message);
    window.close();
  } catch (error) {
    logger.error('Could not hand the task over to the tab', error);
    show({ kind: 'error' }, { animate: true });
  }
}

function runAction(chosen: string | undefined): void {
  const { state } = current;
  if (chosen === 'retry') {
    void recheck();
    return;
  }
  if (!('origin' in state)) return;
  if (chosen === 'activate') void activate(state);
  if (chosen === 'deactivate') void deactivate(state);
  if (chosen === 'pick') void handOverToTab(PICK_CAPTION);
  if (chosen === 'load') void handOverToTab(LOAD_FILE);
}

async function openShortcuts(): Promise<void> {
  try {
    await browser.runtime.openOptionsPage();
    window.close();
  } catch (error) {
    logger.error('Could not open the shortcuts page', error);
    window.open(shortcutsLink.getAttribute('href') ?? '', '_blank');
  }
}

shortcutsLink.addEventListener('click', (event) => {
  event.preventDefault();
  void openShortcuts();
});
for (const control of [action, ...actionLinks]) {
  control.addEventListener('click', () => {
    runAction(control.dataset.action);
  });
}
void firstCheck();
