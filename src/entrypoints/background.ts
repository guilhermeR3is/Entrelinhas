import { defineBackground } from 'wxt/utils/define-background';
import { relayFrameTranslation } from '../translation/frame-translation';
import { serveTranslationCache } from '../translation/translation-service';
import { serveSiteAccess } from '../universal/site-access';
import { serveVocabulary } from '../vocabulary/vocabulary-service';
import { serveWordRanks } from '../vocabulary/word-ranks-service';

export default defineBackground(() => {
  serveTranslationCache();
  serveSiteAccess();
  relayFrameTranslation();
  serveWordRanks();
  serveVocabulary();
});
