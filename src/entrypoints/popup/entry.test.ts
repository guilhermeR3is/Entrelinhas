import { describe, expect, it } from 'vitest';
import { entryFor, thumbTabLetter } from './entry';

describe('entryFor', () => {
  it('names the supported site and lights the thumb tab', () => {
    expect(entryFor({ kind: 'active', site: 'youtube.com' })).toEqual({
      headword: 'youtube.com',
      wordClass: 'site suportado',
      definition: 'Ativa neste site.',
      thumbTab: 'lit',
      retry: false,
    });
  });

  it('tells where the extension works when the site is not supported', () => {
    const entry = entryFor({ kind: 'inactive' });
    expect(entry.definition).toContain('YouTube');
    expect(entry.thumbTab).toBe('hidden');
    expect(entry.retry).toBe(false);
  });

  it('offers a retry and hides the thumb tab on error', () => {
    const entry = entryFor({ kind: 'error' });
    expect(entry.retry).toBe(true);
    expect(entry.thumbTab).toBe('hidden');
  });

  it('never promises dual subtitles before they exist', () => {
    for (const state of [
      { kind: 'active', site: 'youtube.com' },
      { kind: 'inactive' },
      { kind: 'error' },
    ] as const) {
      expect(JSON.stringify(entryFor(state)).toLowerCase()).not.toContain('legenda');
    }
  });
});

describe('thumbTabLetter', () => {
  it('uses the first letter of the site in upper case', () => {
    expect(thumbTabLetter('youtube.com')).toBe('Y');
  });

  it('is empty for an empty headword', () => {
    expect(thumbTabLetter('')).toBe('');
  });
});
