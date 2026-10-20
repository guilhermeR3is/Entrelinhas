import { defineBackground } from 'wxt/utils/define-background';
import { relayFrameTranslation } from '../translation/frame-translation';
import { serveTranslationCache } from '../translation/translation-service';
import { serveSiteAccess } from '../universal/site-access';

export default defineBackground(() => {
  serveTranslationCache();
  serveSiteAccess();
  relayFrameTranslation();
});
