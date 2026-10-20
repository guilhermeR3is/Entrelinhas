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
import { frameTranslatorApi, servePageTranslation } from '../translation/frame-translation';
import { NativeTrackAdapter } from '../universal/native-track-adapter';
import { ScreenCaptionAdapter } from '../universal/screen-caption-adapter';
import {
  LOAD_FILE,
  PICK_CAPTION,
  SITE_DEACTIVATED,
  readSiteMessage,
} from '../universal/site-message';
import { readSiteRule, saveSiteRule, type SiteRule } from '../universal/site-rules';
import { captionSelector } from '../universal/caption-selector';
import { CaptionPicker } from '../overlay/caption-picker';
import { FileLoader } from '../overlay/file-loader';
import type { Cue } from '../subtitles/cue';
import { readSubtitleFile } from '../subtitles/subtitle-file';
import { FileTrackAdapter } from '../universal/file-track-adapter';
import { coverVideo } from '../universal/video-cover';
import { mayRunInFrame } from '../universal/frame-access';

export default defineContentScript({
  registration: 'runtime',
  cssInjectionMode: 'manual',
  async main(ctx) {
    const inFrame = window.self !== window.top;
    if (inFrame && !(await mayRunInFrame())) return;
    let session: SubtitleSession | undefined;
    let sessionBox: HTMLElement | undefined;
    let picker: CaptionPicker | undefined;
    let loader: FileLoader | undefined;
    let fileCues: readonly Cue[] | null = null;
    let mounted: { container: HTMLElement; video: HTMLVideoElement } | undefined;
    let rule: SiteRule | null = null;
    let cover: ResizeObserver | undefined;
    let fontLoaded = false;
    let keys = DEFAULT_KEYS;
    const translation = new PortugueseTranslation(() => session?.render());
    const translatorApi = inFrame
      ? frameTranslatorApi()
      : import.meta.env.MODE === 'e2e'
        ? fakeTranslatorApi(window)
        : findTranslatorApi(globalThis);
    void translation.prepare(translatorApi, window, ctx.signal);
    if (!inFrame) servePageTranslation(translation, ctx.signal);
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
      const { video } = mounted;
      session = new SubtitleSession(
        sessionBox,
        fileCues
          ? new FileTrackAdapter(video, fileCues)
          : rule
            ? new ScreenCaptionAdapter(video, rule.captionSelector)
            : new NativeTrackAdapter(video),
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
    const loadFile = async (file: File) => {
      fileCues = await readSubtitleFile(file, 'en');
    };
    const openFileLoader = () => {
      if (!mounted || picker || loader) return;
      stopSession();
      loader = new FileLoader(mounted.container, mounted.video, loadFile, () => {
        loader = undefined;
        startSession();
      });
    };
    const pickCaption = () => {
      if (!mounted || picker || loader) return;
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
      if (type === null) return;
      if (type === SITE_DEACTIVATED.type) ctx.abort();
      if (type === PICK_CAPTION.type) pickCaption();
      if (type === LOAD_FILE.type) openFileLoader();
      sendResponse({ received: true });
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
        loader?.close();
        loader = undefined;
        stopSession();
        cover?.disconnect();
        mounted = undefined;
      },
    });
    ui.autoMount();
  },
});
