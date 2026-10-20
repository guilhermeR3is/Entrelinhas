import { defineBackground } from 'wxt/utils/define-background';
import { serveTranslationCache } from '../translation/translation-service';
import { serveSiteAccess } from '../universal/site-access';

export default defineBackground(() => {
  serveTranslationCache();
  serveSiteAccess();
});
