import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SubtitleFormatError } from '../subtitles/cue';
import { SubtitleFileTooLargeError } from '../subtitles/subtitle-file';
import { FileLoader, type LoadSubtitleFile, shortFileName } from './file-loader';

describe('FileLoader', () => {
  let window: JSDOM['window'];
  let container: HTMLElement;
  let video: HTMLVideoElement;
  let load: ReturnType<typeof vi.fn<LoadSubtitleFile>>;
  let onDone: ReturnType<typeof vi.fn<() => void>>;
  let loader: FileLoader;

  beforeEach(() => {
    window = new JSDOM('<video></video><div id="overlay"></div>').window;
    vi.stubGlobal('AbortController', window.AbortController);
    const document = window.document;
    container = document.querySelector<HTMLElement>('#overlay') ?? document.body;
    video = document.querySelector('video') ?? document.createElement('video');
    video.getBoundingClientRect = () => ({ left: 0, top: 0, right: 480, bottom: 270 }) as DOMRect;
    load = vi.fn<LoadSubtitleFile>(() => Promise.resolve());
    onDone = vi.fn<() => void>();
    loader = new FileLoader(container, video, load, onDone);
  });

  afterEach(() => {
    loader.close();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function find(selector: string): HTMLElement {
    const element = container.querySelector<HTMLElement>(selector);
    if (!element) throw new Error(`Missing ${selector}`);
    return element;
  }

  function choose(file: File): void {
    const input = find('input[type="file"]');
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new window.Event('change'));
  }

  async function settle(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
  }

  it('asks for a subtitle file at the top of the video and offers the button', () => {
    expect(find('.file-strip').textContent).toContain('Legenda duplaarquivo');
    expect(find('.definition').textContent).toBe('Solte aqui um arquivo .srt ou .vtt.');
    expect(find('.definition').getAttribute('role')).toBe('status');
    expect(find('.file-actions button').textContent).toBe('Escolher arquivo');
    expect(find('input[type="file"]').getAttribute('accept')).toBe(
      '.srt,.vtt,text/vtt,application/x-subrip',
    );
    expect(window.document.activeElement).toBe(find('.file-actions button'));
  });

  it('opens the file picker from the button', () => {
    const picked = vi.fn();
    find('input[type="file"]').addEventListener('click', picked);
    find('.file-actions button').click();
    expect(picked).toHaveBeenCalledOnce();
  });

  it('keeps the picker open after its own synthetic click', () => {
    find('.file-actions button').click();
    expect(onDone).not.toHaveBeenCalled();
    expect(container.querySelector('.file-strip')).not.toBeNull();
  });

  it('names the loaded file, hides the button and steps aside after five seconds', async () => {
    vi.useFakeTimers();
    const file = new window.File(['WEBVTT'], 'aula-3.en.srt');
    choose(file);
    expect(find('.definition').textContent).toBe('Abrindo o arquivo…');
    expect(find('.file-actions button').hasAttribute('disabled')).toBe(true);
    await settle();

    expect(load).toHaveBeenCalledWith(file);
    expect(find('.definition').textContent).toBe(
      'Lendo aula-3.en.srt. Ajuste o atraso na faixa de estudo.',
    );
    expect(find('.file-actions').hidden).toBe(true);
    expect(onDone).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(5000);
    expect(container.querySelector('.file-strip')).toBeNull();
  });

  it.each([
    [
      new SubtitleFormatError('no cues'),
      'Esse arquivo não tem uma legenda .srt ou .vtt que dê para ler.',
    ],
    [new SubtitleFileTooLargeError('big'), 'Esse arquivo é grande demais para ser uma legenda.'],
    [new Error('NotReadableError'), 'Não deu para abrir esse arquivo.'],
  ])('explains a failed file and lets the person try another (%s)', async (error, message) => {
    load.mockRejectedValueOnce(error);
    choose(new window.File(['x'], 'filme.mp4'));
    await settle();

    expect(find('.definition').textContent).toBe(message);
    expect(find('.file-actions button').hasAttribute('disabled')).toBe(false);
    expect(window.document.activeElement).toBe(find('.file-actions button'));
    expect(onDone).not.toHaveBeenCalled();
  });

  it('gives up with Esc and gives the caption back', () => {
    window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
    expect(container.querySelector('.file-strip')).toBeNull();
    expect(onDone).toHaveBeenCalledOnce();
  });

  it('gives up on a click outside the video, not on one inside it', () => {
    window.dispatchEvent(new window.MouseEvent('click', { clientX: 100, clientY: 100 }));
    expect(onDone).not.toHaveBeenCalled();
    window.dispatchEvent(new window.MouseEvent('click', { clientX: 600, clientY: 100 }));
    expect(onDone).toHaveBeenCalledOnce();
  });

  it('keeps clicks and keys on the strip away from the player', () => {
    const reachedPlayer = vi.fn();
    container.addEventListener('click', reachedPlayer);
    container.addEventListener('keydown', reachedPlayer);
    find('.file-actions button').click();
    find('.file-actions button').dispatchEvent(
      new window.KeyboardEvent('keydown', { key: ' ', bubbles: true }),
    );
    expect(reachedPlayer).not.toHaveBeenCalled();
  });
});

describe('shortFileName', () => {
  it('keeps a name that fits', () => {
    expect(shortFileName('aula-3.en.srt')).toBe('aula-3.en.srt');
  });

  it('cuts a long name in the middle and keeps its ending', () => {
    expect(
      shortFileName(
        'The.Very.Long.Documentary.About.Learning.English.2026.1080p.WEBRip.en.forced.srt',
      ),
    ).toBe('The.Very.Long.Documentar…n.forced.srt');
  });

  it('never splits a character in two', () => {
    const name = `${'🎬'.repeat(40)}.srt`;
    expect(Array.from(shortFileName(name))).toHaveLength(37);
    expect(shortFileName(name)).not.toContain('\uFFFD');
  });
});
