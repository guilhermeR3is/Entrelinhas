import { defineBackground } from 'wxt/utils/define-background';
import { serveTranslationCache } from '../translation/translation-service';

export default defineBackground(() => {
  serveTranslationCache();
});
