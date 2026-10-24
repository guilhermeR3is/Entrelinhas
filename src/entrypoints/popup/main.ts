import '@fontsource-variable/atkinson-hyperlegible-next/wght.css';
import '@fontsource-variable/atkinson-hyperlegible-next/wght-italic.css';
import './style.css';
import { browser } from 'wxt/browser';
import { logger } from '../../logger';
import { isTurnedOff, turnSite } from '../../site-switch';
import { type TabStatus, tabStatusFromUrl } from '../../tab-status';
import { choosePlayerFrame, measureFrames, type PlayerFrame } from '../../universal/player-frames';
import {
  LOAD_FILE,
  PICK_CAPTION,
  SITE_DEACTIVATED,
  SITE_PROBLEM,
  type SiteProblem,
  readSiteProblem,
} from '../../universal/site-message';
import { ACTION_LABELS, entryFor, thumbTabLetter, type EntryState } from './entry';

type SiteState = Extract<EntryState, { origin: string }>;
type PlayerState = Extract<EntryState, { playerOrigin: string }>;
type CurrentTab = {
  state: EntryState;
  tabId: number | undefined;
  url: string | undefined;
  player: PlayerFrame | null;
  granted: readonly string[];
};

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
const vocabularyLink = element('.vocabulary-link');
let current: CurrentTab = {
  state: { kind: 'error' },
  tabId: undefined,
  url: undefined,
  player: null,
  granted: [],
};

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
  if (view.definitionTerm === null) {
    definition.textContent = view.definition;
  } else {
    const term = document.createElement('strong');
    term.append(...breakAtDots(view.definitionTerm));
    const sentenceEnd = document.createElement('span');
    sentenceEnd.className = 'term';
    sentenceEnd.append(term, '.');
    definition.replaceChildren(`${view.definition} `, sentenceEnd);
  }
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
    const status = tabStatusFromUrl(tab?.url, origins);
    const host = siteHost(tab?.url);
    const captionRuns = status.kind === 'enabled' || status.kind === 'active';
    const [player, problem, turnedOff] = await Promise.all([
      status.kind === 'enabled' ? findPlayer(tab?.id, tab?.url) : null,
      captionRuns ? askForProblem(tab?.id) : null,
      captionRuns && host !== null ? isTurnedOff(browser.storage.local, host) : false,
    ]);
    return {
      state: withSwitch(withProblem(withPlayer(status, player, origins), problem), turnedOff),
      tabId: tab?.id,
      url: tab?.url,
      player,
      granted: origins,
    };
  } catch (error) {
    logger.error('Could not read the active tab', error);
    return {
      state: { kind: 'error' },
      tabId: undefined,
      url: undefined,
      player: null,
      granted: [],
    };
  }
}

async function findPlayer(
  tabId: number | undefined,
  url: string | undefined,
): Promise<PlayerFrame | null> {
  if (tabId === undefined || url === undefined) return null;
  try {
    const [measured] = await browser.scripting.executeScript({
      target: { tabId },
      func: measureFrames,
    });
    return choosePlayerFrame(measured?.result, url);
  } catch (error) {
    logger.error('Could not look for a player in the page', error);
    return null;
  }
}

async function askForProblem(tabId: number | undefined): Promise<SiteProblem | null> {
  if (tabId === undefined) return null;
  try {
    return readSiteProblem(await browser.tabs.sendMessage(tabId, SITE_PROBLEM));
  } catch (error) {
    logger.error('No content script answered in the tab', error);
    return null;
  }
}

function siteHost(url: string | undefined): string | null {
  return url !== undefined && URL.canParse(url) ? new URL(url).hostname : null;
}

function withSwitch(state: EntryState, turnedOff: boolean): EntryState {
  if (!turnedOff || !('site' in state)) return state;
  return 'origin' in state
    ? { kind: 'turned-off', site: state.site, origin: state.origin }
    : { kind: 'turned-off', site: state.site };
}

function withProblem(state: EntryState, problem: SiteProblem | null): EntryState {
  if (problem === 'stopped' && 'site' in state) {
    return 'origin' in state
      ? { kind: 'stopped', site: state.site, origin: state.origin }
      : { kind: 'stopped', site: state.site };
  }
  if (problem === 'learned-caption-missing' && state.kind === 'enabled') {
    return { ...state, kind: 'caption-missing' };
  }
  return state;
}

function withPlayer(
  status: TabStatus,
  player: PlayerFrame | null,
  granted: readonly string[],
): EntryState {
  if (status.kind !== 'enabled' || !player || granted.includes(player.playerOrigin)) return status;
  return { ...status, ...player, kind: 'player-needed' };
}

async function activate({ site, origin }: SiteState): Promise<void> {
  setBusy(true);
  try {
    const granted = await browser.permissions.request({ origins: [origin] });
    if (!granted) {
      show({ kind: 'denied', site, origin }, { animate: true });
      return;
    }
    const player = await findPlayer(current.tabId, current.url);
    current = { ...current, player, granted: [...current.granted, origin] };
    show(withPlayer({ kind: 'enabled', site, origin }, player, current.granted), { animate: true });
  } catch (error) {
    logger.error('Could not ask Chrome for the site', error);
    show({ kind: 'error' }, { animate: true });
  }
}

async function activatePlayer(state: PlayerState): Promise<void> {
  setBusy(true);
  try {
    const granted = await browser.permissions.request({ origins: [state.playerOrigin] });
    if (granted) current = { ...current, granted: [...current.granted, state.playerOrigin] };
    show({ ...state, kind: granted ? 'player-enabled' : 'player-denied' }, { animate: true });
  } catch (error) {
    logger.error('Could not ask Chrome for the player', error);
    show({ kind: 'error' }, { animate: true });
  }
}

async function reloadTab(): Promise<void> {
  const { tabId } = current;
  setBusy(true);
  try {
    if (tabId === undefined) throw new Error('The active tab has no id');
    await browser.tabs.reload(tabId);
    window.close();
  } catch (error) {
    logger.error('Could not reload the tab', error);
    show({ kind: 'error' }, { animate: true });
  }
}

async function deactivate({ site, origin }: SiteState): Promise<void> {
  const playerOrigin = current.player?.playerOrigin;
  const origins =
    playerOrigin && current.granted.includes(playerOrigin) ? [origin, playerOrigin] : [origin];
  setBusy(true);
  try {
    await browser.permissions.remove({ origins });
    current = { ...current, granted: current.granted.filter((kept) => !origins.includes(kept)) };
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

async function switchCaption(on: boolean): Promise<void> {
  const host = siteHost(current.url);
  setBusy(true);
  try {
    if (host === null) throw new Error('The active tab has no site');
    await turnSite(browser.storage.local, host, on);
  } catch (error) {
    logger.error('Could not switch the caption on the site', error);
    show({ kind: 'error' }, { animate: true });
    return;
  }
  const tab = await readCurrentTab();
  current = tab;
  show(tab.state, { animate: true });
  const undo = on ? 'turn-off' : 'turn-on';
  [action, ...actionLinks].find((control) => control.dataset.action === undo)?.focus();
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
  if (chosen === 'reload') {
    void reloadTab();
    return;
  }
  if (chosen === 'turn-off' || chosen === 'turn-on') {
    void switchCaption(chosen === 'turn-on');
    return;
  }
  if (!('origin' in state)) return;
  if (chosen === 'activate') void activate(state);
  if (chosen === 'activate-player' && 'playerOrigin' in state) void activatePlayer(state);
  if (chosen === 'deactivate') void deactivate(state);
  if (chosen === 'pick') void handOverToTab(PICK_CAPTION);
  if (chosen === 'load') void handOverToTab(LOAD_FILE);
}

async function openVocabulary(): Promise<void> {
  try {
    await browser.tabs.create({ url: browser.runtime.getURL('/vocabulary.html') });
    window.close();
  } catch (error) {
    logger.error('Could not open the vocabulary page', error);
    window.open(vocabularyLink.getAttribute('href') ?? '', '_blank');
  }
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
vocabularyLink.addEventListener('click', (event) => {
  event.preventDefault();
  void openVocabulary();
});
for (const control of [action, ...actionLinks]) {
  control.addEventListener('click', () => {
    runAction(control.dataset.action);
  });
}
void firstCheck();
