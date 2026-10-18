import { defineContentScript } from 'wxt/utils/define-content-script';
import { captureCaptionTracks } from '../youtube/caption-capture';

export default defineContentScript({
  matches: ['https://www.youtube.com/*'],
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    captureCaptionTracks(window);
  },
});
