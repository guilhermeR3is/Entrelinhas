import { afterEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  MAY_RUN_IN_FRAME,
  isFrameAccessRequest,
  mayRunInFrame,
  pageIsAllowed,
} from './frame-access';

describe('pageIsAllowed', () => {
  const SITES = ['https://www.example.com/*', 'http://localhost/*'];

  it('accepts a page whose address the person turned on, at any path or port', () => {
    expect(pageIsAllowed(SITES, 'https://www.example.com/aula/3?t=10')).toBe(true);
    expect(pageIsAllowed(SITES, 'http://localhost:4321/framed-player.html')).toBe(true);
  });

  it('refuses other addresses, other schemes and pages it cannot read', () => {
    expect(pageIsAllowed(SITES, 'https://example.com/')).toBe(false);
    expect(pageIsAllowed(SITES, 'http://www.example.com/')).toBe(false);
    expect(pageIsAllowed(SITES, 'http://127.0.0.1:4321/')).toBe(false);
    expect(pageIsAllowed(SITES, 'not a url')).toBe(false);
    expect(pageIsAllowed(SITES, undefined)).toBe(false);
  });
});

describe('isFrameAccessRequest', () => {
  it('recognizes only the frame question', () => {
    expect(isFrameAccessRequest(MAY_RUN_IN_FRAME)).toBe(true);
    expect(isFrameAccessRequest({ type: 'projeto-bilingue:pick-caption' })).toBe(false);
    expect(isFrameAccessRequest(null)).toBe(false);
  });
});

describe('mayRunInFrame', () => {
  afterEach(() => {
    fakeBrowser.reset();
  });

  it('follows the answer of the service worker', async () => {
    fakeBrowser.runtime.onMessage.addListener((_message, _sender, sendResponse) => {
      sendResponse({ allowed: true });
      return true;
    });
    expect(await mayRunInFrame()).toBe(true);
  });

  it('stays quiet on an answer it does not understand', async () => {
    fakeBrowser.runtime.onMessage.addListener((_message, _sender, sendResponse) => {
      sendResponse({ allowed: 'yes' });
      return true;
    });
    expect(await mayRunInFrame()).toBe(false);
  });

  it('stays quiet when nobody answers', async () => {
    expect(await mayRunInFrame()).toBe(false);
  });
});
