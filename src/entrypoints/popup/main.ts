import '@fontsource-variable/atkinson-hyperlegible-next/wght.css';
import '@fontsource-variable/atkinson-hyperlegible-next/wght-italic.css';
import './style.css';
import { browser } from 'wxt/browser';
import { logger } from '../../logger';
import { tabStatusFromUrl } from '../../tab-status';
import { entryFor, thumbTabLetter, type EntryState } from './entry';

const SLOW_CHECK_NOTICE_MS = 150;

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

function show(state: EntryState): void {
  const view = entryFor(state);
  headword.textContent = view.headword;
  wordClass.textContent = view.wordClass;
  definition.textContent = view.definition;
  thumbTab.dataset.state = view.thumbTab;
  thumbTab.textContent = view.thumbTab === 'lit' ? thumbTabLetter(view.headword) : '';
  retry.hidden = !view.retry;
  checking.hidden = true;
  entry.hidden = false;
}

async function checkCurrentTab(): Promise<void> {
  entry.hidden = true;
  retry.hidden = true;
  thumbTab.dataset.state = 'hidden';
  const slowNotice = setTimeout(() => {
    checking.hidden = false;
  }, SLOW_CHECK_NOTICE_MS);

  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    show(tabStatusFromUrl(tab?.url));
  } catch (error) {
    logger.error('Could not read the active tab', error);
    show({ kind: 'error' });
  } finally {
    clearTimeout(slowNotice);
  }
}

retry.addEventListener('click', () => void checkCurrentTab());
void checkCurrentTab();
