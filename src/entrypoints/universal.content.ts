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
import { ScreenCaptionAdapter } from '../universal/screen-caption-adapter';
import { PICK_CAPTION, SITE_DEACTIVATED, readSiteMessage } from '../universal/site-message';
import { readSiteRule, saveSiteRule, type SiteRule } from '../universal/site-rules';
import { captionSelector } from '../universal/caption-selector';
import { CaptionPicker } from '../overlay/caption-picker';
import { coverVideo } from '../universal/video-cover';

export default defineContentScript({
  registration: 'runtime',
  cssInjectionMode: 'manual',
  async main(ctx) {
    let session: SubtitleSession | undefined;
    let sessionBox: HTMLElement | undefined;
    let picker: CaptionPicker | undefined;
    let mounted: { container: HTMLElement; video: HTMLVideoElement } | undefined;
    let rule: SiteRule | null = null;
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
    rule = await readSiteRule(browser.storage.local, location.host);
    keys = preferences.current.keys;
    preferences.followKeys((chosen) => {
      keys = chosen;
      session?.setKeys(chosen);
    }, ctx.signal);

    const startSession = () => {
      if (!mounted) return;
      sessionBox = document.createElement('div');
      mounted.container.append(sessionBox);
      session = new SubtitleSession(
        sessionBox,
        rule
          ? new ScreenCaptionAdapter(mounted.video, rule.captionSelector)
          : new NativeTrackAdapter(mounted.video),
        translation,
        preferences,
      );
    };
    const stopSession = () => {
      session?.stop();
      session = undefined;
      sessionBox?.remove();
      sessionBox = undefined;
    };
    const learn = async (element: Element) => {
      const selector = captionSelector(element);
      if (!selector) return false;
      const learned = { captionSelector: selector };
      await saveSiteRule(browser.storage.local, location.host, learned);
      rule = learned;
      return true;
    };
    const pickCaption = () => {
      if (!mounted || picker) return;
      stopSession();
      picker = new CaptionPicker(mounted.container, mounted.video, learn, () => {
        picker = undefined;
        startSession();
      });
    };

    const answerPopup = (
      message: unknown,
      _sender: unknown,
      sendResponse: (response: { received: boolean }) => void,
    ) => {
      const type = readSiteMessage(message);
      if (type === SITE_DEACTIVATED.type) ctx.abort();
      if (type === PICK_CAPTION.type) pickCaption();
      sendResponse({ received: type !== null });
    };
    browser.runtime.onMessage.addListener(answerPopup);
    ctx.onInvalidated(() => {
      browser.runtime.onMessage.removeListener(answerPopup);
    });

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
        mounted = { container, video };
        startSession();
      },
      onRemove: () => {
        picker?.close();
        picker = undefined;
        stopSession();
        cover?.disconnect();
        mounted = undefined;
      },
    });
    ui.autoMount();
  },
});
