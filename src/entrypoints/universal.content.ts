import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root';
import { fakeTranslatorApi } from '../../e2e/fake-translator';
import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import overlayCss from '../overlay/subtitle-overlay.css?inline';
import { loadSubtitleFont } from '../overlay/subtitle-font';
import { SubtitleSession } from '../session/subtitle-session';
import { DEFAULT_KEYS, listenForStudyKeys } from '../study/study-keys';
import { StudyPreferenceStore } from '../study/study-preferences';
import { PortugueseTranslation } from '../translation/portuguese-translation';
import { findTranslatorApi } from '../translation/translator-api';
import { NativeTrackAdapter } from '../universal/native-track-adapter';
import { coverVideo } from '../universal/video-cover';

export default defineContentScript({
  registration: 'runtime',
  cssInjectionMode: 'manual',
  async main(ctx) {
    let session: SubtitleSession | undefined;
    let cover: ResizeObserver | undefined;
    let fontLoaded = false;
    let keys = DEFAULT_KEYS;
    const translation = new PortugueseTranslation(() => session?.render());
    const translatorApi =
      import.meta.env.MODE === 'e2e' ? fakeTranslatorApi(window) : findTranslatorApi(globalThis);
    void translation.prepare(translatorApi, window, ctx.signal);
    listenForStudyKeys(
      window,
      (command) => !ctx.isInvalid && (session?.handleCommand(command) ?? false),
      ctx.signal,
      () => keys,
    );

    const preferences = await StudyPreferenceStore.load(browser.storage.local);
    keys = preferences.current.keys;
    preferences.followKeys((chosen) => {
      keys = chosen;
      session?.setKeys(chosen);
    }, ctx.signal);
    const ui = await createShadowRootUi(ctx, {
      name: 'projeto-bilingue-legenda',
      position: 'inline',
      css: overlayCss,
      anchor: 'video',
      append: 'after',
      onMount: (container, _shadow, host) => {
        const video = host.previousElementSibling;
        if (!(video instanceof HTMLVideoElement)) return;
        if (!fontLoaded) loadSubtitleFont(document.fonts);
        fontLoaded = true;
        cover = coverVideo(container, video);
        session = new SubtitleSession(
          container,
          new NativeTrackAdapter(video),
          translation,
          preferences,
        );
      },
      onRemove: () => {
        cover?.disconnect();
        session?.stop();
        session = undefined;
      },
    });
    ui.autoMount();
  },
});
