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
  let resize: () => void;

  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          resize = callback;
        }
        observe = vi.fn();
      },
    );
    container = new JSDOM().window.document.body;
    overlay = new SubtitleOverlay(container);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
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

  describe('study strip', () => {
    const onCommand = vi.fn();

    beforeEach(() => {
      container.replaceChildren();
      onCommand.mockClear();
      overlay = new SubtitleOverlay(container, onCommand);
    });

    function stripShown(): boolean {
      return find('.strip').classList.contains('shown') && !find('.box').hidden;
    }

    it('stays out of sight while the video plays', () => {
      overlay.setStudyState(true, false);
      overlay.showCues([cue('Hello')]);
      expect(stripShown()).toBe(false);
      expect(find('.box').hidden).toBe(false);
    });

    it('shows while the video is paused, even between cues', () => {
      overlay.setStudyState(true, true);
      expect(stripShown()).toBe(true);
      expect(find('.subtitle').hidden).toBe(true);
    });

    it('never shows when studying is not available, such as during an ad', () => {
      overlay.setStudyState(false, true);
      overlay.flashStrip();
      expect(stripShown()).toBe(false);
      expect(find('.box').hidden).toBe(true);
    });

    it('shows for a second and a half after a key', () => {
      vi.useFakeTimers();
      overlay.setStudyState(true, false);
      overlay.flashStrip();
      expect(stripShown()).toBe(true);
      vi.advanceTimersByTime(1400);
      overlay.flashStrip();
      vi.advanceTimersByTime(1400);
      expect(stripShown()).toBe(true);
      vi.advanceTimersByTime(100);
      expect(stripShown()).toBe(false);
    });

    it('stays while a control has the keyboard focus', () => {
      overlay.setStudyState(true, false);
      overlay.showCues([cue('Hello')]);
      find('.strip button').focus();
      expect(stripShown()).toBe(true);
      find('.strip button').blur();
      expect(stripShown()).toBe(false);
    });

    it('shows the speed the Brazilian way and marks the ends of the range', () => {
      const [slower, faster] = Array.from(container.querySelectorAll('.strip button:not(.handle)'));
      expect(find('.speed').textContent).toBe('1x');
      overlay.setSpeed(0.85);
      expect(find('.speed').textContent).toBe('0,85x');
      overlay.setSpeed(0.5);
      expect(slower?.getAttribute('aria-disabled')).toBe('true');
      expect(faster?.getAttribute('aria-disabled')).toBe('false');
      overlay.setSpeed(2);
      expect(faster?.getAttribute('aria-disabled')).toBe('true');
    });

    it('names each button with its key and runs its command', () => {
      const [slower, faster] = Array.from(
        container.querySelectorAll<HTMLButtonElement>('.strip button:not(.handle)'),
      );
      expect(slower?.getAttribute('aria-label')).toBe('Mais devagar');
      expect(slower?.getAttribute('aria-keyshortcuts')).toBe('Z');
      expect(faster?.textContent).toBe('+X');
      slower?.click();
      faster?.click();
      expect(onCommand.mock.calls).toEqual([['slower'], ['faster']]);
    });

    it('ignores a press on a button at the end of the range', () => {
      overlay.setSpeed(2);
      container.querySelectorAll<HTMLButtonElement>('.strip button:not(.handle)')[1]?.click();
      expect(onCommand).not.toHaveBeenCalled();
    });

    it('blurs the Portuguese and marks the switch as on', () => {
      overlay.setBlurred(true);
      expect(find('.box').classList.contains('blurred')).toBe(true);
      expect(
        container.querySelectorAll('.strip button:not(.handle)')[4]?.getAttribute('aria-pressed'),
      ).toBe('true');
      overlay.setBlurred(false);
      expect(find('.box').classList.contains('blurred')).toBe(false);
    });

    it('shows the blurred Portuguese until the next sentence arrives', () => {
      overlay.setBlurred(true);
      overlay.showCues([cue('Where are you')], [cue('Aonde você vai?', 'pt')]);
      overlay.revealPortuguese();
      expect(find('.portuguese').classList.contains('revealed')).toBe(true);

      overlay.showCues([cue('going?')], [cue('Aonde você vai?', 'pt')]);
      expect(find('.portuguese').classList.contains('revealed')).toBe(true);

      overlay.showCues([cue('Home.')], [cue('Para casa.', 'pt')]);
      expect(find('.portuguese').classList.contains('revealed')).toBe(false);
    });

    it('keeps clicks inside the box away from the player', () => {
      const reachedPlayer = vi.fn();
      container.addEventListener('click', reachedPlayer);
      container.addEventListener('dblclick', reachedPlayer);
      find('.strip button').click();
      const view = container.ownerDocument.defaultView;
      if (!view) throw new Error('Missing window');
      find('.english').dispatchEvent(new view.MouseEvent('dblclick', { bubbles: true }));
      expect(reachedPlayer).not.toHaveBeenCalled();
    });

    it('keeps the keys pressed on a control away from the player', () => {
      const reachedPlayer = vi.fn();
      container.addEventListener('keydown', reachedPlayer);
      const view = container.ownerDocument.defaultView;
      if (!view) throw new Error('Missing window');
      find('.strip button').dispatchEvent(
        new view.KeyboardEvent('keydown', { key: ' ', bubbles: true }),
      );
      expect(reachedPlayer).not.toHaveBeenCalled();
    });
  });

  describe('moving the box', () => {
    function layOut(frame: { width: number; height: number }): void {
      Object.defineProperty(find('.frame'), 'clientWidth', {
        value: frame.width,
        configurable: true,
      });
      Object.defineProperty(find('.frame'), 'clientHeight', {
        value: frame.height,
        configurable: true,
      });
      Object.defineProperty(find('.box'), 'getBoundingClientRect', {
        value: () => ({ width: 200, height: 60 }),
        configurable: true,
      });
      overlay.showCues([cue('Hello')]);
      resize();
    }

    function press(key: string): KeyboardEvent {
      const view = container.ownerDocument.defaultView;
      if (!view) throw new Error('Missing window');
      const event = new view.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      find('.handle').dispatchEvent(event);
      return event;
    }

    it('starts centred near the bottom of the video', () => {
      layOut({ width: 1000, height: 500 });
      expect(find('.box').style.left).toBe('400px');
      expect(find('.box').style.bottom).toBe('20px');
      expect(find('.box').style.getPropertyValue('--lift-shift')).toBe('0px');
    });

    it('rises 8 px above the player controls and moves from where it is shown', () => {
      layOut({ width: 1000, height: 500 });
      overlay.setControlsLift(60);
      expect(find('.box').style.getPropertyValue('--lift-shift')).toBe('48px');

      press('ArrowUp');
      expect(find('.box').style.bottom).toBe('93px');
      expect(find('.box').style.getPropertyValue('--lift-shift')).toBe('0px');
    });

    it('never rises past the top of the video to get away from the controls', () => {
      layOut({ width: 1000, height: 500 });
      find('.handle').click();
      overlay.setControlsLift(460);
      expect(find('.box').style.getPropertyValue('--lift-shift')).toBe('20px');
    });

    it('goes down to the very bottom once the player controls hide', () => {
      layOut({ width: 1000, height: 500 });
      for (let step = 0; step < 3; step += 1) press('ArrowDown');
      expect(find('.box').style.bottom).toBe('0px');
      expect(find('.box').style.getPropertyValue('--lift-shift')).toBe('0px');
    });

    it('goes to the top on a click of the handle and back on the next one', () => {
      layOut({ width: 1000, height: 500 });
      find('.handle').click();
      expect(find('.box').style.top).toBe('20px');
      expect(find('.box').style.bottom).toBe('');
      expect(find('.box').classList.contains('top-edge')).toBe(true);

      find('.handle').click();
      expect(find('.box').style.bottom).toBe('20px');
      expect(find('.box').classList.contains('top-edge')).toBe(false);
    });

    it('moves by 5% of the video with the arrow keys and keeps the page from scrolling', () => {
      layOut({ width: 1000, height: 500 });
      expect(press('ArrowRight').defaultPrevented).toBe(true);
      expect(find('.box').style.left).toBe('450px');
      press('ArrowUp');
      expect(find('.box').style.bottom).toBe('45px');
      expect(press('Enter').defaultPrevented).toBe(false);
    });

    it('stays put when a key arrives while the video has no size', () => {
      layOut({ width: 0, height: 0 });
      press('ArrowLeft');
      layOut({ width: 1000, height: 500 });
      expect(find('.box').style.left).toBe('400px');
      expect(find('.box').style.bottom).toBe('20px');
    });

    it('labels the handle and tells how to move it from the keyboard', () => {
      const handle = find('.handle');
      expect(handle.getAttribute('aria-label')).toBe('Mover a legenda');
      const hint = container.querySelector(`#${handle.getAttribute('aria-describedby') ?? ''}`);
      expect(hint?.textContent).toContain('setas');
    });
  });
});
