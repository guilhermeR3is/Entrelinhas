import { expect, it } from 'vitest';
import { SITE_DEACTIVATED, isSiteDeactivated } from './site-message';

it('recognizes only the message that turns a site off', () => {
  expect(isSiteDeactivated(SITE_DEACTIVATED)).toBe(true);
  expect(isSiteDeactivated({ type: 'projeto-bilingue:find-translations' })).toBe(false);
  expect(isSiteDeactivated('projeto-bilingue:site-deactivated')).toBe(false);
  expect(isSiteDeactivated(null)).toBe(false);
});
