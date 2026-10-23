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

const PLAYER_SELECTOR = '#movie_player';

export default defineContentScript({
  matches: ['https://www.youtube.com/*'],
  runAt: 'document_start',
  cssInjectionMode: 'ui',
  async main(ctx) {
    const captions = new YouTubeCaptions(window);
    let session: SubtitleSession | undefined;
    let fontLoaded = false;
    let stoppedByError = false;
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
    const ui = await createShadowRootUi(ctx, {
      name: 'projeto-bilingue-legenda',
      position: 'inline',
      anchor: PLAYER_SELECTOR,
      onMount: (container) => {
        const player = document.querySelector(PLAYER_SELECTOR);
        if (!player || stoppedByError) return;
        if (!fontLoaded) loadSubtitleFont(document.fonts);
        fontLoaded = true;
        session = new SubtitleSession(
          container,
          new YouTubePlayerAdapter(player, captions),
          study.translation,
          preferences,
          () => {
            stoppedByError = true;
          },
        );
      },
      onRemove: () => {
        session?.stop();
        session = undefined;
      },
    });
    ui.autoMount();
  },
});
