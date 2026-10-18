import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Cue } from '../subtitles/cue';
import { SubtitleOverlay } from './subtitle-overlay';

function cue(text: string, lang = 'en'): Cue {
  return { id: 0, startMs: 0, endMs: 1000, text, lang };
}

describe('SubtitleOverlay', () => {
  let container: HTMLElement;
  let overlay: SubtitleOverlay;

  beforeEach(() => {
    container = new JSDOM().window.document.body;
    overlay = new SubtitleOverlay(container);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function find(selector: string): HTMLElement {
    const element = container.querySelector<HTMLElement>(selector);
    if (!element) throw new Error(`Missing ${selector}`);
    return element;
  }

  it('starts with nothing on screen but a status region ready to speak', () => {
    expect(find('.subtitle').hidden).toBe(true);
    expect(find('.status').getAttribute('role')).toBe('status');
    expect(find('.status').childElementCount).toBe(0);
  });

  it('shows the English line alone while there is no Portuguese source', () => {
    overlay.showCues([cue('If you want to learn something,')]);
    expect(find('.subtitle').hidden).toBe(false);
    expect(find('.english').textContent).toBe('If you want to learn something,');
    expect(find('.english').lang).toBe('en');
    expect(find('.portuguese').hidden).toBe(true);
  });

  it('shows English on top and Portuguese below, each tagged with its language', () => {
    overlay.showCues([cue('Where are you going?')], [cue('Aonde você vai?', 'pt')]);
    const [first, second] = Array.from(find('.subtitle').children);
    expect(first?.textContent).toBe('Where are you going?');
    expect(second?.textContent).toBe('Aonde você vai?');
    expect(second?.getAttribute('lang')).toBe('pt-BR');
  });

  it('joins cues that are on screen together and keeps their line breaks', () => {
    overlay.showCues([cue("I don't know.\nMaybe home."), cue('[music]')]);
    expect(find('.english').textContent).toBe("I don't know.\nMaybe home.\n[music]");
  });

  it('hides the whole block between cues instead of leaving an empty box', () => {
    overlay.showCues([cue('Hello')]);
    overlay.showCues([]);
    expect(find('.subtitle').hidden).toBe(true);
  });

  it('does not touch the page when the same cues are shown again', () => {
    const cues = [cue('Hello')];
    overlay.showCues(cues);
    find('.english').textContent = 'changed outside';
    overlay.showCues(cues);
    expect(find('.english').textContent).toBe('changed outside');
  });

  it.each([
    ['captions-off', 'desligada', 'Ligue a legenda (CC) em inglês.'],
    ['other-language', 'outro idioma', 'Escolha inglês na legenda (CC).'],
    ['unreadable', 'indisponível', 'Não deu para ler a legenda deste vídeo.'],
  ] as const)('writes the %s notice as a dictionary entry', (notice, wordClass, definition) => {
    overlay.showNotice(notice);
    expect(find('.status .headword').textContent).toBe('Legenda dupla');
    expect(find('.status .word-class').textContent).toBe(wordClass);
    expect(find('.status .definition').textContent).toBe(definition);
  });

  it('removes the notice after five seconds', () => {
    vi.useFakeTimers();
    overlay.showNotice('captions-off');
    vi.advanceTimersByTime(4999);
    expect(find('.status').childElementCount).toBe(1);
    vi.advanceTimersByTime(1);
    expect(find('.status').childElementCount).toBe(0);
  });

  it('restarts the five seconds when a new notice replaces the old one', () => {
    vi.useFakeTimers();
    overlay.showNotice('captions-off');
    vi.advanceTimersByTime(3000);
    overlay.showNotice('other-language');
    vi.advanceTimersByTime(3000);
    expect(find('.status .word-class').textContent).toBe('outro idioma');
    expect(container.querySelectorAll('.notice')).toHaveLength(1);
  });

  it('hands the height of the player controls to the stylesheet', () => {
    overlay.setControlsLift(59);
    expect(find('.frame').style.getPropertyValue('--controls-lift')).toBe('59px');
  });

  it('drops the notice as soon as a cue appears', () => {
    overlay.showNotice('captions-off');
    overlay.showCues([cue('Hello')]);
    expect(find('.status').childElementCount).toBe(0);
  });
});
