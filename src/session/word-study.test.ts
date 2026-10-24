import { IDBFactory } from 'fake-indexeddb';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { SubtitleOverlay } from '../overlay/subtitle-overlay';
import type { PageTranslatorStatus } from '../translation/portuguese-translation';
import { findWord, saveWord } from '../vocabulary/vocabulary-client';
import { serveVocabulary } from '../vocabulary/vocabulary-service';
import { parseWordRanks } from '../vocabulary/word-ranks';
import { videoTitle, WordStudy } from './word-study';

class FakeVideo extends EventTarget {
  paused = false;
  currentTime = 83.6;
  pause = vi.fn(() => {
    this.paused = true;
  });
  play = vi.fn(() => {
    this.paused = false;
    this.dispatchEvent(new Event('play'));
    return Promise.resolve();
  });
}

describe('WordStudy', () => {
  let dom: JSDOM;
  let overlay: SubtitleOverlay;
  let video: FakeVideo;
  let status: PageTranslatorStatus;
  let translateText: ReturnType<typeof vi.fn<() => Promise<string | null>>>;
  let listeners: AbortController;

  function find(selector: string): HTMLElement {
    const element = dom.window.document.querySelector<HTMLElement>(selector);
    if (!element) throw new Error(`Missing ${selector}`);
    return element;
  }

  function pick(text = 'Where are you going, stranger?', position = 5): void {
    overlay.showCues([{ id: 0, startMs: 0, endMs: 1000, text, lang: 'en' }], []);
    find(`.english .word:nth-of-type(${String(position)})`).click();
  }

  function button(label: string): HTMLButtonElement {
    const found = Array.from(dom.window.document.querySelectorAll('.word-card button')).find(
      (candidate) => candidate.textContent === label,
    );
    if (!found) throw new Error(`Missing button ${label}`);
    return found as HTMLButtonElement;
  }

  beforeEach(() => {
    fakeBrowser.reset();
    vi.stubGlobal('indexedDB', new IDBFactory());
    serveVocabulary();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe = vi.fn();
      },
    );
    dom = new JSDOM('<title>(3) Words we borrowed - YouTube</title><body></body>', {
      url: 'https://www.youtube.com/watch?v=abc',
    });
    overlay = new SubtitleOverlay(dom.window.document.body);
    overlay.setHighlight({ ranks: parseWordRanks('where\nare\nyou\ngoing\n'), level: 1000 });
    video = new FakeVideo();
    status = 'ready';
    translateText = vi.fn(() => Promise.resolve('estranho'));
    listeners = new dom.window.AbortController();
    new WordStudy(
      overlay,
      () => video as unknown as HTMLVideoElement,
      { pageStatus: () => status, translateText },
      dom.window.document,
      listeners.signal,
    );
  });

  afterEach(() => {
    listeners.abort();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('pauses the video and shows the word with its translation', async () => {
    pick();

    expect(video.pause).toHaveBeenCalled();
    expect(find('.word-card').hidden).toBe(false);
    expect(find('.word-card .headword').textContent).toBe('stranger');
    expect(find('.word-card .word-class').textContent).toBe('pouco comum');
    expect(find('.word-card .meaning').textContent).toBe('Traduzindo…');
    await vi.waitFor(() => {
      expect(find('.word-card .meaning').textContent).toBe('estranho');
    });
    expect(translateText).toHaveBeenCalledWith('stranger', expect.any(AbortSignal));
  });

  it('plays the video again when the card it paused is closed', () => {
    pick();
    button('Fechar').click();

    expect(find('.word-card').hidden).toBe(true);
    expect(video.play).toHaveBeenCalledTimes(1);
  });

  it('closes with Escape while open, and leaves Escape to the page otherwise', () => {
    pick();
    const escape = () =>
      new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    const first = escape();
    dom.window.document.body.dispatchEvent(first);
    expect(first.defaultPrevented).toBe(true);
    expect(find('.word-card').hidden).toBe(true);
    expect(video.play).toHaveBeenCalledTimes(1);

    const second = escape();
    dom.window.document.body.dispatchEvent(second);
    expect(second.defaultPrevented).toBe(false);
  });

  it('leaves a video that was already paused as it was', () => {
    video.paused = true;
    pick();
    button('Fechar').click();

    expect(video.pause).not.toHaveBeenCalled();
    expect(video.play).not.toHaveBeenCalled();
  });

  it('keeps the first pause when another word is picked, and closes when the video plays', () => {
    pick();
    pick('Where are you going, stranger?', 1);
    expect(find('.word-card .headword').textContent).toBe('Where');
    expect(find('.word-card .word-class').textContent).toBe('comum');

    void video.play();
    expect(find('.word-card').hidden).toBe(true);
    expect(video.play).toHaveBeenCalledTimes(1);
  });

  it('closes on a click outside the box and stays open for clicks inside it', () => {
    pick();
    find('.word-card').dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true }));
    expect(find('.word-card').hidden).toBe(false);

    dom.window.document.body.dispatchEvent(
      new dom.window.MouseEvent('pointerdown', { bubbles: true }),
    );
    expect(find('.word-card').hidden).toBe(true);
    expect(video.play).toHaveBeenCalled();
  });

  it.each([
    ['preparing', 'O português ainda não está pronto.'],
    ['unsupported', 'Este navegador não traduz para o português.'],
    ['failed', 'Não deu para traduzir esta palavra.'],
  ] as const)('says why there is no translation while the translator is %s', (state, text) => {
    status = state;
    pick();
    expect(find('.word-card .meaning').textContent).toBe(text);
    expect(translateText).not.toHaveBeenCalled();
  });

  it('says so when the word cannot be translated', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    translateText.mockRejectedValue(new Error('model gone'));
    pick();
    await vi.waitFor(() => {
      expect(find('.word-card .meaning').textContent).toBe('Não deu para traduzir esta palavra.');
    });
  });

  it('saves the word with its sentence and the moment of the video, and takes it back', async () => {
    pick();
    await vi.waitFor(() => {
      expect(find('.word-card .meaning').textContent).toBe('estranho');
    });

    button('Salvar').click();
    await vi.waitFor(() => {
      expect(button('Salva').getAttribute('aria-pressed')).toBe('true');
    });
    expect(await findWord('stranger')).toMatchObject({
      shown: 'stranger',
      translation: 'estranho',
      sentence: 'Where are you going, stranger?',
      sentenceTranslation: null,
      videoTitle: 'Words we borrowed',
      videoUrl: 'https://www.youtube.com/watch?v=abc&t=83s',
      timeMs: 83_600,
    });

    button('Salva').click();
    await vi.waitFor(() => {
      expect(button('Salvar').getAttribute('aria-pressed')).toBe('false');
    });
    expect(await findWord('stranger')).toBeNull();
  });

  it('shows a word saved before as saved', async () => {
    await saveWord({
      word: 'stranger',
      shown: 'Stranger',
      translation: 'estranho',
      sentence: '',
      sentenceTranslation: null,
      videoTitle: '',
      videoUrl: '',
      timeMs: 0,
    });
    pick();
    await vi.waitFor(() => {
      expect(button('Salva').getAttribute('aria-pressed')).toBe('true');
    });
  });

  it('says so and keeps the button when the word cannot be saved', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    fakeBrowser.reset();
    pick();
    button('Salvar').click();
    await vi.waitFor(() => {
      expect(find('.word-card .word-problem').textContent).toBe(
        'Não deu para salvar. Tente de novo.',
      );
    });
    expect(button('Salvar').getAttribute('aria-disabled')).toBe('false');
  });
});

describe('videoTitle', () => {
  it('drops the notification count and the site name YouTube adds, or uses the host', () => {
    const page = (title: string) =>
      new JSDOM(`<title>${title}</title>`, { url: 'https://cursos.example/aula' }).window.document;
    expect(videoTitle(page('(12) Learn English - YouTube'))).toBe('Learn English');
    expect(videoTitle(page('Aula 3'))).toBe('Aula 3');
    expect(videoTitle(page(''))).toBe('cursos.example');
  });
});
