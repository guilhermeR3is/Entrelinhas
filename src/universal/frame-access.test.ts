import { afterEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  MAY_RUN_IN_FRAME,
  isFrameAccessRequest,
  allowedPageHost,
  pageHostAroundFrame,
} from './frame-access';

describe('allowedPageHost', () => {
  const SITES = ['https://www.example.com/*', 'http://localhost/*'];

  it('accepts a page whose address the person turned on, at any path or port', () => {
    expect(allowedPageHost(SITES, 'https://www.example.com/aula/3?t=10')).toBe('www.example.com');
    expect(allowedPageHost(SITES, 'http://localhost:4321/framed-player.html')).toBe('localhost');
  });

  it('refuses other addresses, other schemes and pages it cannot read', () => {
    expect(allowedPageHost(SITES, 'https://example.com/')).toBeNull();
    expect(allowedPageHost(SITES, 'http://www.example.com/')).toBeNull();
    expect(allowedPageHost(SITES, 'http://127.0.0.1:4321/')).toBeNull();
    expect(allowedPageHost(SITES, 'not a url')).toBeNull();
    expect(allowedPageHost(SITES, undefined)).toBeNull();
  });
});

describe('isFrameAccessRequest', () => {
  it('recognizes only the frame question', () => {
    expect(isFrameAccessRequest(MAY_RUN_IN_FRAME)).toBe(true);
    expect(isFrameAccessRequest({ type: 'projeto-bilingue:pick-caption' })).toBe(false);
    expect(isFrameAccessRequest(null)).toBe(false);
  });
});

describe('pageHostAroundFrame', () => {
  afterEach(() => {
    fakeBrowser.reset();
  });

  it('follows the answer of the service worker', async () => {
    fakeBrowser.runtime.onMessage.addListener((_message, _sender, sendResponse) => {
      sendResponse({ pageHost: 'www.example.com' });
      return true;
    });
    expect(await pageHostAroundFrame()).toBe('www.example.com');
  });

  it('stays quiet on an answer it does not understand', async () => {
    fakeBrowser.runtime.onMessage.addListener((_message, _sender, sendResponse) => {
      sendResponse({ allowed: true });
      return true;
    });
    expect(await pageHostAroundFrame()).toBeNull();
  });

  it('stays quiet when nobody answers', async () => {
    expect(await pageHostAroundFrame()).toBeNull();
  });
});
