import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root';
import { fakeTranslatorApi } from '../../e2e/fake-translator';
import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import '../overlay/subtitle-overlay.css';
import { loadSubtitleFont } from '../overlay/subtitle-font';
import { DEFAULT_KEYS, listenForStudyKeys } from '../study/study-keys';
import { StudyPreferenceStore } from '../study/study-preferences';
import { PortugueseTranslation } from '../translation/portuguese-translation';
import { findTranslatorApi } from '../translation/translator-api';
import { SubtitleSession } from '../youtube/subtitle-session';
import { YouTubeAdapter } from '../youtube/youtube-adapter';

const PLAYER_SELECTOR = '#movie_player';

export default defineContentScript({
  matches: ['https://www.youtube.com/*'],
  runAt: 'document_start',
  cssInjectionMode: 'ui',
  async main(ctx) {
    const adapter = new YouTubeAdapter(window);
    let session: SubtitleSession | undefined;
    let fontLoaded = false;
    let keys = DEFAULT_KEYS;
    const translation = new PortugueseTranslation(() => session?.render());
    const translatorApi =
      import.meta.env.MODE === 'e2e' ? fakeTranslatorApi(window) : findTranslatorApi(globalThis);
    void translation.prepare(translatorApi, window, ctx.signal);
    listenForStudyKeys(
      window,
      (command) => session?.handleCommand(command) ?? false,
      ctx.signal,
      () => keys,
    );
    ctx.addEventListener(window, 'message', (event) => {
      adapter.receive(event);
      session?.render();
    });

    const preferences = await StudyPreferenceStore.load(browser.storage.local);
    keys = preferences.current.keys;
    preferences.followKeys((chosen) => {
      keys = chosen;
      session?.setKeys(chosen);
    }, ctx.signal);
    const ui = await createShadowRootUi(ctx, {
      name: 'projeto-bilingue-legenda',
      position: 'inline',
      anchor: PLAYER_SELECTOR,
      onMount: (container) => {
        const player = document.querySelector(PLAYER_SELECTOR);
        if (!player) return;
        if (!fontLoaded) loadSubtitleFont(document.fonts);
        fontLoaded = true;
        session = new SubtitleSession(container, player, adapter, translation, preferences);
      },
      onRemove: () => {
        session?.stop();
        session = undefined;
      },
    });
    ui.autoMount();
  },
});
