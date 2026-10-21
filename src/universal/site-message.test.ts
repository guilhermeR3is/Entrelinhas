import { expect, it } from 'vitest';
import {
  LOAD_FILE,
  PICK_CAPTION,
  SITE_DEACTIVATED,
  SITE_PROBLEM,
  readSiteMessage,
  readSiteProblem,
} from './site-message';

it('recognizes the messages the popup sends to the page', () => {
  expect(readSiteMessage(SITE_DEACTIVATED)).toBe(SITE_DEACTIVATED.type);
  expect(readSiteMessage(PICK_CAPTION)).toBe(PICK_CAPTION.type);
  expect(readSiteMessage(LOAD_FILE)).toBe(LOAD_FILE.type);
  expect(readSiteMessage(SITE_PROBLEM)).toBe(SITE_PROBLEM.type);
});

it('ignores anything else', () => {
  expect(readSiteMessage({ type: 'projeto-bilingue:find-translations' })).toBeNull();
  expect(readSiteMessage('projeto-bilingue:site-deactivated')).toBeNull();
  expect(readSiteMessage(null)).toBeNull();
});

it('reads the problem a page reports back to the popup', () => {
  expect(readSiteProblem({ problem: 'stopped' })).toBe('stopped');
  expect(readSiteProblem({ problem: 'learned-caption-missing' })).toBe('learned-caption-missing');
});

it('treats a missing or unknown reply as no problem', () => {
  expect(readSiteProblem(undefined)).toBeNull();
  expect(readSiteProblem({ received: true })).toBeNull();
  expect(readSiteProblem({ problem: 'on-fire' })).toBeNull();
});
