import { describe, expect, it } from 'vitest';
import { tabStatusFromUrl } from './tab-status';

describe('tabStatusFromUrl', () => {
  it('is active on a YouTube video page', () => {
    expect(tabStatusFromUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('active');
  });

  it('is active on any YouTube page, since navigation there happens without reloads', () => {
    expect(tabStatusFromUrl('https://www.youtube.com/')).toBe('active');
  });

  it('is inactive when the browser hides the url from the extension', () => {
    expect(tabStatusFromUrl(undefined)).toBe('inactive');
  });

  it('is inactive on sites without an adapter', () => {
    expect(tabStatusFromUrl('https://www.netflix.com/watch/123')).toBe('inactive');
  });

  it('is inactive on look-alike hosts', () => {
    expect(tabStatusFromUrl('https://www.youtube.com.evil.example/watch')).toBe('inactive');
    expect(tabStatusFromUrl('https://notwww.youtube.com/')).toBe('inactive');
  });

  it('is inactive on plain http', () => {
    expect(tabStatusFromUrl('http://www.youtube.com/')).toBe('inactive');
  });

  it('is inactive on browser pages and malformed urls', () => {
    expect(tabStatusFromUrl('chrome://extensions')).toBe('inactive');
    expect(tabStatusFromUrl('not a url')).toBe('inactive');
    expect(tabStatusFromUrl('')).toBe('inactive');
  });
});
