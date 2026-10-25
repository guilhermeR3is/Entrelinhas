import '../../fonts.css';
import './style.css';
import { browser } from 'wxt/browser';
import { logger } from '../../logger';
import { StudyPreferenceStore } from '../../study/study-preferences';
import { ANKI_FILE_NAME, ankiCsv } from '../../vocabulary/anki-export';
import { formatVideoTime, isWebLink } from '../../vocabulary/video-moment';
import { listWords, removeWord, reviewWord } from '../../vocabulary/vocabulary-client';
import type { SavedWord } from '../../vocabulary/vocabulary-store';
import {
  HIGHLIGHT_LEVELS,
  type HighlightSetting,
  splitAroundWord,
} from '../../vocabulary/word-ranks';
import {
  byLetter,
  countsText,
  dueText,
  nextReviewText,
  rememberedLabel,
  reviewQueue,
} from './review-text';

const SLOW_LOAD_NOTICE_MS = 150;
const EMPTY_INTRO = 'As palavras que você salvou clicando na legenda.';

function element<Type extends HTMLElement>(selector: string, type: new () => Type): Type {
  const found = document.querySelector(selector);
  if (!(found instanceof type)) throw new Error(`Vocabulary element ${selector} not found`);
  return found;
}

const intro = element('.intro', HTMLElement);
const loading = element('.loading', HTMLElement);
const review = element('.review', HTMLElement);
const reviewEntry = element('.review-entry', HTMLElement);
const reviewHeadword = element('.review-word', HTMLElement);
const sentence = element('.sentence', HTMLElement);
const source = element('.source', HTMLElement);
const answer = element('.answer', HTMLElement);
const meaning = element('.meaning', HTMLElement);
const sentenceMeaning = element('.sentence-meaning', HTMLElement);
const reviewProblem = element('.review-problem', HTMLElement);
const reveal = element('.reveal', HTMLButtonElement);
const forgot = element('.forgot', HTMLButtonElement);
const remembered = element('.remembered', HTMLButtonElement);
const statusEntry = element('.status-entry', HTMLElement);
const statusHeadword = element('.status-headword', HTMLElement);
const statusClass = element('.status-class', HTMLElement);
const statusDefinition = element('.status-definition', HTMLElement);
const retry = element('.retry', HTMLButtonElement);
const levels = element('.levels', HTMLFieldSetElement);
const highlightProblem = element('.highlight-problem', HTMLElement);
const saved = element('.saved', HTMLElement);
const exportButton = element('.export', HTMLButtonElement);
const savedStatus = element('.saved-status', HTMLElement);
const wordList = element('.word-list', HTMLElement);

let words: SavedWord[] = [];
let queue: SavedWord[] = [];
let answering = false;

function child(tag: string, className: string, text = ''): HTMLElement {
  const created = document.createElement(tag);
  created.className = className;
  created.textContent = text;
  return created;
}

function setBusy(button: HTMLButtonElement, busy: boolean): void {
  button.disabled = busy;
  button.toggleAttribute('aria-busy', busy);
}

function showStatus(headword: string, wordClass: string, definition: string, failed = false): void {
  reviewEntry.hidden = true;
  statusHeadword.textContent = headword;
  statusClass.textContent = wordClass;
  statusDefinition.textContent = definition;
  retry.hidden = !failed;
  statusEntry.hidden = false;
  review.hidden = false;
}

function showReview(word: SavedWord): void {
  reviewHeadword.textContent = word.shown;
  sentence.replaceChildren(
    ...splitAroundWord(word.sentence, word.word).map((part) =>
      part.isWord ? child('strong', '', part.text) : document.createTextNode(part.text),
    ),
  );
  const moment = `${word.videoTitle} · ${formatVideoTime(word.timeMs)}`;
  if (isWebLink(word.videoUrl)) {
    const link = child('a', 'link', moment) as HTMLAnchorElement;
    link.href = word.videoUrl;
    link.target = '_blank';
    link.rel = 'noreferrer';
    source.replaceChildren(link);
  } else {
    source.textContent = moment;
  }
  meaning.textContent = word.translation ?? 'Sem tradução salva.';
  sentenceMeaning.textContent = word.sentenceTranslation ?? '';
  remembered.textContent = rememberedLabel(word);
  answer.hidden = true;
  reveal.hidden = false;
  forgot.hidden = true;
  remembered.hidden = true;
  reviewProblem.textContent = '';
  statusEntry.hidden = true;
  reviewEntry.hidden = false;
  review.hidden = false;
}

function showNextReview(moveFocus: boolean): void {
  const now = Date.now();
  const next = queue[0];
  if (words.length === 0) {
    showStatus(
      'Palavras salvas',
      'nenhuma ainda',
      'Clique numa palavra da legenda e escolha Salvar. Ela aparece aqui para revisar.',
    );
  } else if (!next) {
    showStatus('Revisão', 'em dia', nextReviewText(words, now));
  } else {
    showReview(next);
    if (moveFocus) reveal.focus();
    return;
  }
  if (moveFocus) statusEntry.focus();
}

function renderWords(): void {
  intro.textContent = words.length > 0 ? countsText(words, Date.now()) : EMPTY_INTRO;
  saved.hidden = words.length === 0;
  const now = Date.now();
  wordList.replaceChildren(
    ...byLetter(words).flatMap(([letter, group]) => {
      const list = child('ul', 'words');
      list.append(...group.map((word) => wordRow(word, now)));
      return [child('h3', 'letter', letter), list];
    }),
  );
}

function wordRow(word: SavedWord, now: number): HTMLElement {
  const row = child('li', 'saved-word');
  const headword = child('span', 'saved-headword', word.shown);
  headword.lang = 'en';
  const translation = child('span', 'saved-meaning', word.translation ?? '');
  translation.lang = 'pt-BR';
  const remove = child('button', 'delete', 'Apagar') as HTMLButtonElement;
  remove.type = 'button';
  remove.dataset.word = word.word;
  remove.setAttribute('aria-label', `Apagar ${word.shown}`);
  remove.addEventListener('click', () => {
    void deleteWord(word, remove);
  });
  row.append(headword, translation, child('span', 'saved-due', dueText(word, now)), remove);
  return row;
}

async function load(): Promise<void> {
  const slowNotice = setTimeout(() => {
    loading.hidden = false;
  }, SLOW_LOAD_NOTICE_MS);
  setBusy(retry, true);
  try {
    words = await listWords();
    queue = reviewQueue(words, Date.now());
    renderWords();
    showNextReview(false);
  } catch (error) {
    logger.error('Could not list the saved words', error);
    saved.hidden = true;
    showStatus('Palavras salvas', 'sem resposta', 'Não deu para abrir as suas palavras.', true);
  } finally {
    clearTimeout(slowNotice);
    loading.hidden = true;
    setBusy(retry, false);
  }
}

async function answerReview(rememberedIt: boolean): Promise<void> {
  const current = queue[0];
  if (!current || answering) return;
  answering = true;
  setBusy(forgot, true);
  setBusy(remembered, true);
  reviewProblem.textContent = '';
  try {
    const updated = await reviewWord(current.word, rememberedIt);
    queue.shift();
    if (updated) {
      words = words.map((word) => (word.word === updated.word ? updated : word));
      if (!rememberedIt) queue.push(updated);
    } else {
      words = words.filter((word) => word.word !== current.word);
    }
    renderWords();
    showNextReview(true);
  } catch (error) {
    logger.error('Could not save the review', error);
    reviewProblem.textContent = 'Não deu para guardar. Tente de novo.';
  } finally {
    answering = false;
    setBusy(forgot, false);
    setBusy(remembered, false);
  }
}

async function deleteWord(word: SavedWord, button: HTMLButtonElement): Promise<void> {
  const buttons = Array.from(wordList.querySelectorAll<HTMLButtonElement>('.delete'));
  const position = buttons.indexOf(button);
  setBusy(button, true);
  savedStatus.textContent = '';
  try {
    await removeWord(word.word);
  } catch (error) {
    logger.error('Could not delete the word', error);
    setBusy(button, false);
    savedStatus.textContent = `Não deu para apagar ${word.shown}. Tente de novo.`;
    return;
  }
  const wasReviewing = queue[0]?.word === word.word && !answering;
  words = words.filter((other) => other.word !== word.word);
  queue = queue.filter((other) => other.word !== word.word);
  renderWords();
  if (wasReviewing || words.length === 0) showNextReview(false);
  savedStatus.textContent = `${word.shown} apagada.`;
  const remaining = Array.from(wordList.querySelectorAll<HTMLButtonElement>('.delete'));
  const focusTarget = remaining[Math.min(position, remaining.length - 1)];
  if (focusTarget) focusTarget.focus();
  else statusEntry.focus();
}

function exportToAnki(): void {
  const file = URL.createObjectURL(new Blob([ankiCsv(words)], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = file;
  link.download = ANKI_FILE_NAME;
  link.click();
  setTimeout(() => {
    URL.revokeObjectURL(file);
  }, 1000);
  savedStatus.textContent = `Arquivo ${ANKI_FILE_NAME} criado. No Anki, abra Arquivo › Importar e escolha esse arquivo.`;
}

function settingOf(value: string): HighlightSetting {
  return HIGHLIGHT_LEVELS.find((level) => String(level) === value) ?? 'off';
}

function checkLevel(setting: HighlightSetting): void {
  const radio = levels.querySelector<HTMLInputElement>(`input[value="${String(setting)}"]`);
  if (radio) radio.checked = true;
}

async function prepareLevels(): Promise<void> {
  const store = await StudyPreferenceStore.load(browser.storage.local);
  checkLevel(store.current.highlightLevel);
  if (store.readFailed) {
    highlightProblem.textContent = 'Não deu para ler a escolha guardada. Mostrando a padrão.';
  }
  levels.disabled = false;
  levels.addEventListener('change', (event) => {
    const previous = store.current.highlightLevel;
    highlightProblem.textContent = '';
    store
      .save({ highlightLevel: settingOf((event.target as HTMLInputElement).value) })
      .catch((error: unknown) => {
        logger.error('Could not save the highlight level', error);
        checkLevel(previous);
        highlightProblem.textContent = 'Não deu para guardar a escolha. Tente de novo.';
      });
  });
}

statusEntry.tabIndex = -1;
reveal.addEventListener('click', () => {
  answer.hidden = false;
  reveal.hidden = true;
  forgot.hidden = false;
  remembered.hidden = false;
  remembered.focus();
});
forgot.addEventListener('click', () => {
  void answerReview(false);
});
remembered.addEventListener('click', () => {
  void answerReview(true);
});
retry.addEventListener('click', () => {
  void load();
});
exportButton.addEventListener('click', exportToAnki);
void load();
void prepareLevels();
