import { describe, expect, it } from 'vitest';
import { entryFor, thumbTabLetter, type EntryState } from './entry';

const ORIGIN = 'https://www.example.com/*';
const ALL_STATES: EntryState[] = [
  { kind: 'active', site: 'youtube.com' },
  { kind: 'available', site: 'example.com', origin: ORIGIN },
  { kind: 'enabled', site: 'example.com', origin: ORIGIN },
  { kind: 'denied', site: 'example.com', origin: ORIGIN },
  { kind: 'unsupported' },
  { kind: 'error' },
];

describe('entryFor', () => {
  it('names the supported site and lights the thumb tab, with nothing to turn off', () => {
    expect(entryFor({ kind: 'active', site: 'youtube.com' })).toEqual({
      headword: 'youtube.com',
      wordClass: 'site compatível',
      definition: 'Ativa aqui.',
      thumbTab: 'lit',
      action: null,
      links: [],
    });
  });

  it('offers to turn on a site that is not on yet', () => {
    const entry = entryFor({ kind: 'available', site: 'example.com', origin: ORIGIN });
    expect(entry).toMatchObject({ headword: 'example.com', wordClass: 'não ativado' });
    expect(entry.action).toBe('activate');
    expect(entry.thumbTab).toBe('hidden');
  });

  it('lights the thumb tab on a site the person turned on, to pick its caption, load a file or turn it off', () => {
    const entry = entryFor({ kind: 'enabled', site: 'example.com', origin: ORIGIN });
    expect(entry).toMatchObject({ wordClass: 'ativado por você', definition: 'Ativa aqui.' });
    expect(entry.action).toBe('pick');
    expect(entry.links).toEqual(['load', 'deactivate']);
    expect(entry.thumbTab).toBe('lit');
  });

  it('offers links only on a site the person turned on', () => {
    for (const state of ALL_STATES) {
      expect(entryFor(state).links.length > 0).toBe(state.kind === 'enabled');
    }
  });

  it('lets the person try again after saying no to Chrome', () => {
    const entry = entryFor({ kind: 'denied', site: 'example.com', origin: ORIGIN });
    expect(entry.definition).toBe('O Chrome ficou sem a permissão. Pode tentar de novo.');
    expect(entry.action).toBe('activate');
  });

  it('explains which pages can work and offers nothing to click', () => {
    const entry = entryFor({ kind: 'unsupported' });
    expect(entry.definition).toBe('Funciona em sites com endereço https.');
    expect(entry.action).toBeNull();
  });

  it('offers a retry and hides the thumb tab on error', () => {
    const entry = entryFor({ kind: 'error' });
    expect(entry.action).toBe('retry');
    expect(entry.thumbTab).toBe('hidden');
  });

  it('never repeats a word between the headword and the word class', () => {
    for (const state of ALL_STATES) {
      const { headword, wordClass } = entryFor(state);
      const lastWord = headword.split(/\s+/).at(-1);
      const firstWord = wordClass.split(/\s+/)[0];
      expect(lastWord).not.toBe(firstWord);
    }
  });
});

describe('thumbTabLetter', () => {
  it('uses the first letter of the site in upper case', () => {
    expect(thumbTabLetter('youtube.com')).toBe('Y');
    expect(thumbTabLetter('écoles.fr')).toBe('É');
  });

  it('is empty for an empty headword', () => {
    expect(thumbTabLetter('')).toBe('');
  });
});
