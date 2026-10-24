import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root';
import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import '../overlay/subtitle-overlay.css';
import { loadSubtitleFont } from '../overlay/subtitle-font';
import { pageTranslatorApi, prepareStudy } from '../session/study-page';
import { SubtitleSession } from '../session/subtitle-session';
import { YouTubeCaptions } from '../youtube/youtube-captions';
import { YouTubePlayerAdapter } from '../youtube/youtube-player-adapter';
import { SITE_PROBLEM, type SiteProblem, readSiteMessage } from '../universal/site-message';
import { followSiteSwitch, isTurnedOff } from '../site-switch';

const PLAYER_SELECTOR = '#movie_player';

export default defineContentScript({
  matches: ['https://www.youtube.com/*'],
  runAt: 'document_start',
  cssInjectionMode: 'ui',
  async main(ctx) {
    const captions = new YouTubeCaptions(window);
    let session: SubtitleSession | undefined;
    let mountedContainer: HTMLElement | undefined;
    let fontLoaded = false;
    let stoppedByError = false;
    let turnedOff = false;
    const study = prepareStudy(window, ctx, pageTranslatorApi(window), () => session);
    ctx.addEventListener(window, 'message', (event) => {
      if (ctx.isInvalid) return;
      captions.receive(event);
      session?.render();
    });
    const answerPopup = (
      message: unknown,
      _sender: unknown,
      sendResponse: (response: { problem: SiteProblem }) => void,
    ) => {
      if (readSiteMessage(message) === SITE_PROBLEM.type && stoppedByError) {
        sendResponse({ problem: 'stopped' });
      }
    };
    browser.runtime.onMessage.addListener(answerPopup);
    ctx.onInvalidated(() => {
      browser.runtime.onMessage.removeListener(answerPopup);
    });

    const preferences = await study.preferences;
    const startSession = () => {
      const player = document.querySelector(PLAYER_SELECTOR);
      if (!mountedContainer || !player || session || stoppedByError || turnedOff) return;
      if (!fontLoaded) loadSubtitleFont(document.fonts);
      fontLoaded = true;
      session = new SubtitleSession(
        mountedContainer,
        new YouTubePlayerAdapter(player, captions),
        study.translation,
        preferences,
        () => {
          stoppedByError = true;
        },
      );
      session.setHighlight(study.highlight.current);
    };
    const stopSession = () => {
      session?.stop();
      session = undefined;
    };
    followSiteSwitch(
      browser.storage.local,
      location.hostname,
      (off) => {
        turnedOff = off;
        if (off) stopSession();
        else startSession();
      },
      ctx.signal,
    );
    turnedOff = await isTurnedOff(browser.storage.local, location.hostname);

    const ui = await createShadowRootUi(ctx, {
      name: 'projeto-bilingue-legenda',
      position: 'inline',
      anchor: PLAYER_SELECTOR,
      onMount: (container) => {
        mountedContainer = container;
        startSession();
      },
      onRemove: () => {
        stopSession();
        mountedContainer = undefined;
      },
    });
    ui.autoMount();
  },
});
