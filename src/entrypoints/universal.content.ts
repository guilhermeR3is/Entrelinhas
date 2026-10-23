import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root';
import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import overlayCss from '../overlay/subtitle-overlay.css?inline';
import { loadSubtitleFont } from '../overlay/subtitle-font';
import { pageTranslatorApi, prepareStudy } from '../session/study-page';
import { SubtitleSession } from '../session/subtitle-session';
import { frameTranslatorApi, servePageTranslation } from '../translation/frame-translation';
import { NativeTrackAdapter } from '../universal/native-track-adapter';
import { ScreenCaptionAdapter } from '../universal/screen-caption-adapter';
import {
  LOAD_FILE,
  PICK_CAPTION,
  SITE_DEACTIVATED,
  SITE_PROBLEM,
  type SiteProblem,
  readSiteMessage,
} from '../universal/site-message';
import { readSiteRule, saveSiteRule, type SiteRule } from '../universal/site-rules';
import { captionSelector } from '../universal/caption-selector';
import { CaptionPicker } from '../overlay/caption-picker';
import { FileLoader } from '../overlay/file-loader';
import type { Cue } from '../subtitles/cue';
import { readSubtitleFile } from '../subtitles/subtitle-file';
import { FileTrackAdapter } from '../universal/file-track-adapter';
import { coverVideo, type VideoCover } from '../universal/video-cover';
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
    let leavingStrip: CaptionPicker | FileLoader | undefined;
    let fileCues: readonly Cue[] | null = null;
    let fileDelayMs = 0;
    let fileAdapter: FileTrackAdapter | undefined;
    let mounted: { container: HTMLElement; video: HTMLVideoElement } | undefined;
    let rule: SiteRule | null = null;
    let cover: VideoCover | undefined;
    let fontLoaded = false;
    let stoppedByError = false;
    const study = prepareStudy(
      window,
      ctx,
      inFrame ? frameTranslatorApi() : pageTranslatorApi(window),
      () => session,
    );
    if (!inFrame) servePageTranslation(study.translation, ctx.signal);

    const preferences = await study.preferences;
    rule = await readSiteRule(browser.storage.local, location.host);

    const startSession = () => {
      if (!mounted || stoppedByError) return;
      sessionBox = document.createElement('div');
      mounted.container.append(sessionBox);
      const { video } = mounted;
      fileAdapter = fileCues ? new FileTrackAdapter(video, fileCues, fileDelayMs) : undefined;
      session = new SubtitleSession(
        sessionBox,
        fileAdapter ??
          (rule
            ? new ScreenCaptionAdapter(video, rule.captionSelector)
            : new NativeTrackAdapter(video)),
        study.translation,
        preferences,
        () => {
          stoppedByError = true;
        },
      );
    };
    const stopSession = () => {
      if (fileAdapter) fileDelayMs = fileAdapter.delayMs;
      fileAdapter = undefined;
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
      fileDelayMs = 0;
    };
    const openFileLoader = () => {
      if (!mounted || picker || loader || stoppedByError) return;
      stopSession();
      leavingStrip?.close();
      loader = new FileLoader(mounted.container, mounted.video, loadFile, () => {
        leavingStrip = loader;
        loader = undefined;
        startSession();
      });
    };
    const pickCaption = () => {
      if (!mounted || picker || loader || stoppedByError) return;
      stopSession();
      leavingStrip?.close();
      picker = new CaptionPicker(mounted.container, mounted.video, learn, () => {
        leavingStrip = picker;
        picker = undefined;
        startSession();
      });
    };

    const siteProblem = (): SiteProblem | null => {
      if (stoppedByError) return 'stopped';
      const waitingForRule = rule !== null && fileCues === null;
      return waitingForRule && session?.problem() === 'captions-missing'
        ? 'learned-caption-missing'
        : null;
    };
    const answerPopup = (
      message: unknown,
      _sender: unknown,
      sendResponse: (response: { received: boolean } | { problem: SiteProblem }) => void,
    ) => {
      const type = readSiteMessage(message);
      if (type === null) return;
      if (type === SITE_PROBLEM.type) {
        const problem = siteProblem();
        if (problem) sendResponse({ problem });
        return;
      }
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
        leavingStrip?.close();
        stopSession();
        cover?.disconnect();
        mounted = undefined;
      },
    });
    ui.autoMount();
  },
});
