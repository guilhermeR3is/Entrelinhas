import { browser } from 'wxt/browser';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { fakeTranslatorApi } from '../../e2e/fake-translator';
import { DEFAULT_KEYS, listenForStudyKeys } from '../study/study-keys';
import { StudyPreferenceStore } from '../study/study-preferences';
import { PortugueseTranslation } from '../translation/portuguese-translation';
import { findTranslatorApi, type TranslatorApi } from '../translation/translator-api';
import { WordHighlight } from '../vocabulary/word-highlight';
import type { SubtitleSession } from './subtitle-session';

type ShownSession = Pick<SubtitleSession, 'render' | 'handleCommand' | 'setKeys' | 'setHighlight'>;

export interface StudyPage {
  translation: PortugueseTranslation;
  preferences: Promise<StudyPreferenceStore>;
  highlight: WordHighlight;
}

export function pageTranslatorApi(page: Window): TranslatorApi | null {
  return import.meta.env.MODE === 'e2e' ? fakeTranslatorApi(page) : findTranslatorApi(globalThis);
}

export function prepareStudy(
  page: Window,
  context: Pick<ContentScriptContext, 'signal' | 'isInvalid'>,
  translatorApi: TranslatorApi | null,
  shownSession: () => ShownSession | undefined,
): StudyPage {
  let keys = DEFAULT_KEYS;
  const highlight = new WordHighlight((current) => {
    shownSession()?.setHighlight(current);
  });
  const translation = new PortugueseTranslation(() => shownSession()?.render());
  void translation.prepare(translatorApi, page, context.signal);
  listenForStudyKeys(
    page,
    (command) => !context.isInvalid && (shownSession()?.handleCommand(command) ?? false),
    context.signal,
    () => keys,
  );
  const preferences = StudyPreferenceStore.load(browser.storage.local).then((store) => {
    keys = store.current.keys;
    store.followKeys((chosen) => {
      keys = chosen;
      shownSession()?.setKeys(chosen);
    }, context.signal);
    highlight.follow(store.current.highlightLevel);
    store.followHighlightLevel((level) => {
      highlight.follow(level);
    }, context.signal);
    return store;
  });
  return { translation, preferences, highlight };
}
