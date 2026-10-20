import '@fontsource-variable/atkinson-hyperlegible-next/wght.css';
import './style.css';
import { browser } from 'wxt/browser';
import { logger } from '../../logger';
import { bindingFor, problemWith } from '../../study/key-rules';
import {
  DEFAULT_KEYS,
  keyLabel,
  STUDY_COMMANDS,
  type KeyBinding,
  type StudyCommand,
  type StudyKeys,
} from '../../study/study-keys';
import { StudyPreferenceStore } from '../../study/study-preferences';
import {
  changedAnnouncement,
  COMMAND_TEXT,
  problemMessage,
  READ_FAILED,
  SAVE_FAILED,
  WAITING_FOR_KEY,
} from './shortcut-text';

const SLOW_LOAD_NOTICE_MS = 150;
const PASSING_KEYS = new Set(['Tab', 'Shift', 'Control', 'Alt', 'Meta', 'CapsLock']);

interface Row {
  item: HTMLElement;
  key: HTMLElement;
  change: HTMLButtonElement;
  message: HTMLElement;
}

function element<Type extends HTMLElement>(selector: string, type: new () => Type): Type {
  const found = document.querySelector(selector);
  if (!(found instanceof type)) throw new Error(`Options element ${selector} not found`);
  return found;
}

const notice = element('.notice', HTMLElement);
const list = element('.shortcuts', HTMLElement);
const footer = element('.footer', HTMLElement);
const reset = element('.reset', HTMLButtonElement);
const resetMessage = element('.reset-message', HTMLElement);
const announcer = element('.announcer', HTMLElement);

function announce(text: string): void {
  announcer.textContent = text;
}

function sameKeys(first: StudyKeys, second: StudyKeys): boolean {
  return STUDY_COMMANDS.every(
    (command) =>
      first[command].key === second[command].key && first[command].shift === second[command].shift,
  );
}

function createRow(command: StudyCommand): Row {
  const { name, description } = COMMAND_TEXT[command];
  const item = document.createElement('li');
  item.className = 'shortcut';
  const heading = document.createElement('h2');
  heading.className = 'name';
  heading.textContent = name;
  const explanation = document.createElement('p');
  explanation.className = 'description';
  explanation.textContent = description;
  const key = document.createElement('kbd');
  key.className = 'key';
  key.id = `key-${command}`;
  const change = document.createElement('button');
  change.type = 'button';
  change.className = 'change ink-button';
  const message = document.createElement('p');
  message.className = 'message';
  message.id = `message-${command}`;
  message.hidden = true;
  change.setAttribute('aria-describedby', `${key.id} ${message.id}`);
  const about = document.createElement('div');
  about.className = 'about';
  about.append(heading, explanation);
  item.append(about, key, change, message);
  return { item, key, change, message };
}

async function start(): Promise<void> {
  const slowNotice = setTimeout(() => {
    notice.textContent = 'Carregando os atalhos…';
    notice.hidden = false;
  }, SLOW_LOAD_NOTICE_MS);
  const store = await StudyPreferenceStore.load(browser.storage.local);
  clearTimeout(slowNotice);
  notice.textContent = store.readFailed ? READ_FAILED : '';
  notice.hidden = !store.readFailed;

  const rows = new Map(STUDY_COMMANDS.map((command) => [command, createRow(command)]));
  let waiting: StudyCommand | null = null;
  let saving = false;

  function render(keys: StudyKeys): void {
    for (const [command, row] of rows) row.key.textContent = keyLabel(keys[command]);
    reset.disabled = sameKeys(keys, DEFAULT_KEYS);
  }

  function showMessage(row: Row, text: string | null): void {
    row.message.textContent = text ?? '';
    row.message.hidden = text === null;
  }

  function setWaiting(command: StudyCommand | null): void {
    for (const [rowCommand, row] of rows) {
      const isWaiting = rowCommand === command;
      const { name } = COMMAND_TEXT[rowCommand];
      row.item.dataset.state = isWaiting ? 'waiting' : 'idle';
      row.change.textContent = isWaiting ? 'Cancelar' : 'Trocar';
      row.change.setAttribute(
        'aria-label',
        isWaiting ? `Cancelar a troca de ${name}` : `Trocar a tecla de ${name}`,
      );
      if (isWaiting || rowCommand === waiting) showMessage(row, isWaiting ? WAITING_FOR_KEY : null);
    }
    waiting = command;
    if (command) announce(WAITING_FOR_KEY);
  }

  async function choose(command: StudyCommand, binding: KeyBinding, row: Row): Promise<void> {
    const keys = store.current.keys;
    const current = keys[command];
    if (current.key === binding.key && current.shift === binding.shift) {
      setWaiting(null);
      return;
    }
    const problem = problemWith(command, binding, keys);
    if (problem) {
      const text = problemMessage(problem, binding);
      showMessage(row, text);
      announce(text);
      return;
    }
    saving = true;
    try {
      const chosen = { ...keys, [command]: binding };
      await store.save({ keys: chosen });
      setWaiting(null);
      render(chosen);
      announce(changedAnnouncement(command, binding));
    } catch (error) {
      logger.error('Could not save the keys', error);
      setWaiting(null);
      showMessage(row, SAVE_FAILED);
      announce(SAVE_FAILED);
    } finally {
      saving = false;
    }
  }

  function onKey(event: KeyboardEvent): void {
    if (!waiting || PASSING_KEYS.has(event.key)) return;
    const row = rows.get(waiting);
    if (!row) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      setWaiting(null);
      announce('Troca cancelada.');
      return;
    }
    if (event.ctrlKey || event.altKey || event.metaKey) {
      showMessage(row, problemMessage({ kind: 'not-a-letter' }, null));
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (saving) return;
    const binding = bindingFor(event);
    if (!binding) {
      const text = problemMessage({ kind: 'not-a-letter' }, null);
      showMessage(row, text);
      announce(text);
      return;
    }
    void choose(waiting, binding, row);
  }

  for (const [command, row] of rows) {
    row.change.addEventListener('click', () => {
      setWaiting(waiting === command ? null : command);
    });
    row.change.addEventListener('focusout', () => {
      if (waiting === command && !saving) setWaiting(null);
    });
    list.append(row.item);
  }

  async function resetKeys(): Promise<void> {
    setWaiting(null);
    resetMessage.hidden = true;
    try {
      await store.save({ keys: DEFAULT_KEYS });
      render(DEFAULT_KEYS);
      announce('As teclas padrão voltaram.');
    } catch (error) {
      logger.error('Could not save the default keys', error);
      resetMessage.textContent = SAVE_FAILED;
      resetMessage.hidden = false;
      announce(SAVE_FAILED);
    }
  }

  reset.addEventListener('click', () => void resetKeys());

  document.addEventListener('keydown', onKey, { capture: true });
  store.followKeys(render, new AbortController().signal);
  setWaiting(null);
  render(store.current.keys);
  list.hidden = false;
  footer.hidden = false;
}

void start();
