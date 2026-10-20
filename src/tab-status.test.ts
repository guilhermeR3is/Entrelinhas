import { describe, expect, it } from 'vitest';
import { tabStatusFromUrl } from './tab-status';

const unsupported = { kind: 'unsupported' };

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

  it('offers any other https site for the person to turn on, asking for that exact address', () => {
    expect(tabStatusFromUrl('https://www.example.com/aula/3')).toEqual({
      kind: 'available',
      site: 'example.com',
      origin: 'https://www.example.com/*',
    });
  });

  it('is enabled on a site the person already turned on', () => {
    expect(
      tabStatusFromUrl('https://aulas.example.com/video', ['https://aulas.example.com/*']),
    ).toEqual({
      kind: 'enabled',
      site: 'aulas.example.com',
      origin: 'https://aulas.example.com/*',
    });
  });

  it('keeps another address of the same site off until it is turned on too', () => {
    expect(tabStatusFromUrl('https://example.com/', ['https://www.example.com/*']).kind).toBe(
      'available',
    );
  });

  it('shows a site with accents as people write it and asks for it as the browser writes it', () => {
    expect(tabStatusFromUrl('https://www.xn--caf-dma.com.br/')).toEqual({
      kind: 'available',
      site: 'café.com.br',
      origin: 'https://www.xn--caf-dma.com.br/*',
    });
  });

  it('treats look-alike hosts as ordinary sites, not as YouTube', () => {
    expect(tabStatusFromUrl('https://www.youtube.com.evil.example/watch').kind).toBe('available');
    expect(tabStatusFromUrl('https://notwww.youtube.com/').kind).toBe('available');
  });

  it('is unsupported when the browser hides the url from the extension', () => {
    expect(tabStatusFromUrl(undefined)).toEqual(unsupported);
  });

  it('is unsupported on plain http, browser pages, files and malformed urls', () => {
    expect(tabStatusFromUrl('http://www.youtube.com/')).toEqual(unsupported);
    expect(tabStatusFromUrl('chrome://extensions')).toEqual(unsupported);
    expect(tabStatusFromUrl('file:///Users/ana/aula.html')).toEqual(unsupported);
    expect(tabStatusFromUrl('not a url')).toEqual(unsupported);
  });
});
