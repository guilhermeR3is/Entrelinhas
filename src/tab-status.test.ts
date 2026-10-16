import { describe, expect, it } from 'vitest';
import { tabStatusFromUrl } from './tab-status';

const inactive = { kind: 'inactive' };

describe('tabStatusFromUrl', () => {
  it('is active on a YouTube video page and names the site without www', () => {
    expect(tabStatusFromUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toEqual({
      kind: 'active',
      site: 'youtube.com',
    });
  });

  it('is active on any YouTube page, since navigation there happens without reloads', () => {
    expect(tabStatusFromUrl('https://www.youtube.com/')).toEqual({
      kind: 'active',
      site: 'youtube.com',
    });
  });

  it('is inactive when the browser hides the url from the extension', () => {
    expect(tabStatusFromUrl(undefined)).toEqual(inactive);
  });

  it('is inactive on sites without an adapter', () => {
    expect(tabStatusFromUrl('https://www.netflix.com/watch/123')).toEqual(inactive);
  });

  it('is inactive on look-alike hosts', () => {
    expect(tabStatusFromUrl('https://www.youtube.com.evil.example/watch')).toEqual(inactive);
    expect(tabStatusFromUrl('https://notwww.youtube.com/')).toEqual(inactive);
  });

  it('is inactive on plain http', () => {
    expect(tabStatusFromUrl('http://www.youtube.com/')).toEqual(inactive);
  });

  it('is inactive on browser pages and malformed urls', () => {
    expect(tabStatusFromUrl('chrome://extensions')).toEqual(inactive);
    expect(tabStatusFromUrl('not a url')).toEqual(inactive);
    expect(tabStatusFromUrl('')).toEqual(inactive);
  });
});
