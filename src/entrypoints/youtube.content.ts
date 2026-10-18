import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root';
import { defineContentScript } from 'wxt/utils/define-content-script';
import '../overlay/subtitle-overlay.css';
import { loadSubtitleFont } from '../overlay/subtitle-font';
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
    ctx.addEventListener(window, 'message', (event) => {
      adapter.receive(event);
      session?.render();
    });

    const ui = await createShadowRootUi(ctx, {
      name: 'projeto-bilingue-legenda',
      position: 'inline',
      anchor: PLAYER_SELECTOR,
      onMount: (container) => {
        const player = document.querySelector(PLAYER_SELECTOR);
        if (!player) return;
        if (!fontLoaded) loadSubtitleFont(document.fonts);
        fontLoaded = true;
        session = new SubtitleSession(container, player, adapter);
      },
      onRemove: () => {
        session?.stop();
        session = undefined;
      },
    });
    ui.autoMount();
  },
});
