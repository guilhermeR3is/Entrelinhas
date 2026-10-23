import { describe, expect, it } from 'vitest';
import { entryFor, thumbTabLetter, type EntryState } from './entry';

const ORIGIN = 'https://www.example.com/*';
const PLAYER = { player: 'player.vimeo.com', playerOrigin: 'https://player.vimeo.com/*' };
const SITE = { site: 'example.com', origin: ORIGIN };
const PLAYER_STATES: EntryState[] = [
  { kind: 'player-needed', ...SITE, ...PLAYER },
  { kind: 'player-denied', ...SITE, ...PLAYER },
  { kind: 'player-enabled', ...SITE, ...PLAYER },
];
const ALL_STATES: EntryState[] = [
  ...PLAYER_STATES,
  { kind: 'active', site: 'youtube.com' },
  { kind: 'available', site: 'example.com', origin: ORIGIN },
  { kind: 'enabled', site: 'example.com', origin: ORIGIN },
  { kind: 'denied', site: 'example.com', origin: ORIGIN },
  { kind: 'caption-missing', ...SITE },
  { kind: 'stopped', ...SITE },
  { kind: 'stopped', site: 'youtube.com' },
  { kind: 'turned-off', ...SITE },
  { kind: 'turned-off', site: 'youtube.com' },
  { kind: 'unsupported' },
  { kind: 'error' },
];

describe('entryFor', () => {
  it('names the supported site and lights the thumb tab, with only the caption to turn off', () => {
    expect(entryFor({ kind: 'active', site: 'youtube.com' })).toEqual({
      headword: 'youtube.com',
      wordClass: 'site compatível',
      definitionTerm: null,
      definition: 'Ativa aqui.',
      thumbTab: 'lit',
      action: null,
      links: ['turn-off'],
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
    expect(entry.links).toEqual(['load', 'turn-off', 'deactivate']);
    expect(entry.thumbTab).toBe('lit');
  });

  it('offers to turn the caption off wherever it is on, and to turn the site off after it', () => {
    for (const state of ALL_STATES) {
      const { links, thumbTab } = entryFor(state);
      expect(links.includes('turn-off')).toBe(thumbTab === 'lit');
      if (links.includes('turn-off') && links.includes('deactivate')) {
        expect(links.indexOf('turn-off')).toBeLessThan(links.indexOf('deactivate'));
      }
    }
  });

  it('offers to turn off the site only where the person turned it on', () => {
    for (const state of ALL_STATES) {
      const turnedOn = 'origin' in state && state.kind !== 'available' && state.kind !== 'denied';
      expect(entryFor(state).links.includes('deactivate')).toBe(turnedOn);
    }
  });

  it('says the caption is off here, puts out the thumb tab and offers to turn it on', () => {
    expect(entryFor({ kind: 'turned-off', ...SITE })).toEqual({
      headword: 'example.com',
      wordClass: 'desligada por você',
      definitionTerm: null,
      definition: 'A legenda dupla não aparece aqui. O vídeo mostra a legenda do próprio site.',
      thumbTab: 'hidden',
      action: 'turn-on',
      links: ['deactivate'],
    });
    expect(entryFor({ kind: 'turned-off', site: 'youtube.com' })).toMatchObject({
      action: 'turn-on',
      links: [],
    });
  });

  it('says the extension stopped, puts out the thumb tab and offers to reload the page', () => {
    expect(entryFor({ kind: 'stopped', ...SITE })).toEqual({
      headword: 'example.com',
      wordClass: 'parou aqui',
      definitionTerm: null,
      definition: 'A legenda dupla parou por um erro. O vídeo continua normal.',
      thumbTab: 'hidden',
      action: 'reload',
      links: ['deactivate'],
    });
  });

  it('has nothing to turn off when it stops on a supported site', () => {
    const entry = entryFor({ kind: 'stopped', site: 'youtube.com' });
    expect(entry.action).toBe('reload');
    expect(entry.links).toEqual([]);
  });

  it('asks to pick the caption again when the learned one does not show up', () => {
    const entry = entryFor({ kind: 'caption-missing', ...SITE });
    expect(entry).toMatchObject({
      wordClass: 'ativado por você',
      definition:
        'A legenda que você escolheu não apareceu neste vídeo. Se o site mudou, escolha de novo.',
      thumbTab: 'lit',
      action: 'pick',
      links: ['load', 'turn-off', 'deactivate'],
    });
  });

  it('names the player of another address and offers to turn it on too', () => {
    const entry = entryFor({ kind: 'player-needed', ...SITE, ...PLAYER });
    expect(entry).toMatchObject({
      headword: 'example.com',
      wordClass: 'ativado por você',
      definition: 'O vídeo desta página está num player de outro endereço:',
      definitionTerm: 'player.vimeo.com',
      thumbTab: 'lit',
      action: 'activate-player',
      links: ['turn-off', 'deactivate'],
    });
  });

  it('lets the person try the player again after saying no to Chrome', () => {
    const entry = entryFor({ kind: 'player-denied', ...SITE, ...PLAYER });
    expect(entry.definition).toBe('O Chrome ficou sem a permissão do player. Pode tentar de novo.');
    expect(entry.action).toBe('activate-player');
  });

  it('asks for a reload once the player is on', () => {
    const entry = entryFor({ kind: 'player-enabled', ...SITE, ...PLAYER });
    expect(entry.definition).toBe(
      'Player ativado. Recarregue a página para a legenda aparecer nele.',
    );
    expect(entry.action).toBe('reload');
    expect(entry.links).toEqual(['turn-off', 'deactivate']);
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
