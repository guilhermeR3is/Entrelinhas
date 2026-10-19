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

  it('fades the notice out after five seconds and then removes it', () => {
    vi.useFakeTimers();
    overlay.showNotice('captions-off');
    vi.advanceTimersByTime(4999);
    expect(find('.notice').classList.contains('leaving')).toBe(false);
    vi.advanceTimersByTime(1);
    expect(find('.notice').classList.contains('leaving')).toBe(true);
    vi.advanceTimersByTime(159);
    expect(find('.status').childElementCount).toBe(1);
    vi.advanceTimersByTime(1);
    expect(find('.status').childElementCount).toBe(0);
  });

  it('drops a fading notice at once when a cue appears', () => {
    vi.useFakeTimers();
    overlay.showNotice('captions-off');
    vi.advanceTimersByTime(5000);
    overlay.showCues([cue('Hello')]);
    expect(find('.status').childElementCount).toBe(0);
  });

  it('gives a notice that replaces a fading one its full five seconds', () => {
    vi.useFakeTimers();
    overlay.showNotice('captions-off');
    vi.advanceTimersByTime(5000);
    overlay.showNotice('other-language');
    vi.advanceTimersByTime(4999);
    expect(find('.notice').classList.contains('leaving')).toBe(false);
    expect(find('.status .word-class').textContent).toBe('outro idioma');
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

  describe('translation state', () => {
    it('takes the place of the Portuguese line, in italics, under the English', () => {
      overlay.showTranslationState({ kind: 'waiting-for-gesture' });
      overlay.showCues([cue('So I wrote a 90-page thesis')]);
      const portuguese = find('.portuguese');
      expect(portuguese.hidden).toBe(false);
      expect(portuguese.textContent).toBe('Clique na página para ligar o português.');
      expect(portuguese.classList.contains('translation-state')).toBe(true);
    });

    it('stays out of sight between cues', () => {
      overlay.showTranslationState({ kind: 'waiting-for-gesture' });
      overlay.showCues([]);
      expect(find('.subtitle').hidden).toBe(true);
    });

    it('gives way to the translation as soon as it arrives', () => {
      overlay.showCues([cue('Hello.')]);
      overlay.showTranslationState({ kind: 'downloading', progress: 0.5 });
      overlay.showCues([cue('Hello.')], [cue('Olá.', 'pt')]);
      const portuguese = find('.portuguese');
      expect(portuguese.textContent).toBe('Olá.');
      expect(portuguese.classList.contains('translation-state')).toBe(false);
    });

    it('shows the download progress as a whole percentage that is not read aloud', () => {
      overlay.showCues([cue('Hello.')]);
      overlay.showTranslationState({ kind: 'downloading', progress: 0.416 });
      expect(find('.portuguese').textContent).toBe('Baixando o português… 42%');
      expect(find('.percent').getAttribute('aria-hidden')).toBe('true');
    });

    it('announces a new state once, not every step of the download', () => {
      overlay.showCues([cue('Hello.')]);
      const announcer = find('.announcer');
      expect(announcer.getAttribute('role')).toBe('status');

      overlay.showTranslationState({ kind: 'downloading', progress: 0 });
      const announcement = announcer.firstChild;
      overlay.showTranslationState({ kind: 'downloading', progress: 0.7 });
      expect(announcer.textContent).toBe('Baixando o português…');
      expect(announcer.firstChild).toBe(announcement);
      expect(find('.percent').textContent).toBe(' 70%');
    });

    it.each([
      ['unsupported', 'Este navegador não traduz para o português.'],
      ['download-failed', 'Não deu para baixar o português. Recarregue a página.'],
      ['translation-failed', 'Não deu para traduzir este vídeo.'],
    ] as const)('shows %s for five seconds and then leaves English alone', (kind, text) => {
      vi.useFakeTimers();
      overlay.showCues([cue('Hello.')]);
      overlay.showTranslationState({ kind });
      expect(find('.portuguese').textContent).toBe(text);

      vi.advanceTimersByTime(4999);
      expect(find('.portuguese').hidden).toBe(false);
      vi.advanceTimersByTime(1);
      expect(find('.portuguese').hidden).toBe(true);
      expect(find('.announcer').textContent).toBe('');
    });

    it('keeps waiting for the click and the download for as long as they last', () => {
      vi.useFakeTimers();
      overlay.showCues([cue('Hello.')]);
      overlay.showTranslationState({ kind: 'waiting-for-gesture' });
      vi.advanceTimersByTime(60_000);
      expect(find('.portuguese').hidden).toBe(false);
      overlay.showTranslationState({ kind: 'downloading', progress: 0.1 });
      vi.advanceTimersByTime(60_000);
      expect(find('.portuguese').textContent).toBe('Baixando o português… 10%');
    });

    it('clears the line when told there is nothing to say', () => {
      overlay.showCues([cue('Hello.')]);
      overlay.showTranslationState({ kind: 'waiting-for-gesture' });
      overlay.showTranslationState(null);
      expect(find('.portuguese').hidden).toBe(true);
      expect(find('.portuguese').textContent).toBe('');
    });

    it('does not let an old five-second timer clear a newer state', () => {
      vi.useFakeTimers();
      overlay.showCues([cue('Hello.')]);
      overlay.showTranslationState({ kind: 'unsupported' });
      vi.advanceTimersByTime(3000);
      overlay.showTranslationState({ kind: 'waiting-for-gesture' });
      vi.advanceTimersByTime(3000);
      expect(find('.portuguese').textContent).toBe('Clique na página para ligar o português.');
    });
  });
});
