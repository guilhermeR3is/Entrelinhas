import { expect, it } from 'vitest';
import { PICK_CAPTION, SITE_DEACTIVATED, readSiteMessage } from './site-message';

it('recognizes the messages the popup sends to the page', () => {
  expect(readSiteMessage(SITE_DEACTIVATED)).toBe(SITE_DEACTIVATED.type);
  expect(readSiteMessage(PICK_CAPTION)).toBe(PICK_CAPTION.type);
});

it('ignores anything else', () => {
  expect(readSiteMessage({ type: 'projeto-bilingue:find-translations' })).toBeNull();
  expect(readSiteMessage('projeto-bilingue:site-deactivated')).toBeNull();
  expect(readSiteMessage(null)).toBeNull();
});
