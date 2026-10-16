import '@fontsource-variable/atkinson-hyperlegible-next/wght.css';
import '@fontsource-variable/atkinson-hyperlegible-next/wght-italic.css';
import './style.css';
import { browser } from 'wxt/browser';
import { logger } from '../../logger';
import { tabStatusFromUrl } from '../../tab-status';
import { entryFor, thumbTabLetter, type EntryState } from './entry';

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
const retry = element('.retry');
const thumbTab = element('.thumb-tab');

function reveal(): void {
  const from = reducedMotion.matches
    ? { opacity: 0 }
    : { opacity: 0, transform: 'translateY(4px)' };
  entry.animate([from, { opacity: 1, transform: 'none' }], {
    duration: 160,
    easing: REVEAL_EASING,
  });
}

function show(state: EntryState, { animate }: { animate: boolean }): void {
  const view = entryFor(state);
  headword.textContent = view.headword;
  wordClass.textContent = view.wordClass;
  definition.textContent = view.definition;
  thumbTab.dataset.state = view.thumbTab;
  thumbTab.textContent = view.thumbTab === 'lit' ? thumbTabLetter(view.headword) : '';
  retry.hidden = !view.retry;
  retry.toggleAttribute('disabled', false);
  retry.removeAttribute('aria-busy');
  checking.hidden = true;
  entry.hidden = false;
  if (animate) reveal();
}

async function firstCheck(): Promise<void> {
  const slowNotice = setTimeout(() => {
    checking.hidden = false;
  }, SLOW_CHECK_NOTICE_MS);

  try {
    const state = await readCurrentTab();
    show(state, { animate: !checking.hidden });
  } finally {
    clearTimeout(slowNotice);
  }
}

async function recheck(): Promise<void> {
  retry.toggleAttribute('disabled', true);
  retry.setAttribute('aria-busy', 'true');
  const state = await readCurrentTab();
  show(state, { animate: state.kind !== 'error' });
  if (state.kind === 'error') retry.focus();
}

async function readCurrentTab(): Promise<EntryState> {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    return tabStatusFromUrl(tab?.url);
  } catch (error) {
    logger.error('Could not read the active tab', error);
    return { kind: 'error' };
  }
}

retry.addEventListener('click', () => void recheck());
void firstCheck();
