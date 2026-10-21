import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScreenCaptionAdapter } from './screen-caption-adapter';

const PAGE = `
  <main>
    <p class="comment">Not a caption</p>
    <div class="fp-player">
      <div class="fp-screen"><video src="https://example.com/lesson.webm"></video></div>
      <div class="fp-captions"></div>
    </div>
  </main>`;
const SELECTOR = 'div.fp-captions span.fp-line';

describe('ScreenCaptionAdapter', () => {
  let document: Document;
  let adapter: ScreenCaptionAdapter;
  let onCaptionsChange: ReturnType<typeof vi.fn<() => void>>;
  let onFailure: ReturnType<typeof vi.fn<(error: unknown) => void>>;

  beforeEach(() => {
    const { window } = new JSDOM(PAGE);
    document = window.document;
    vi.stubGlobal('MutationObserver', window.MutationObserver);
    vi.stubGlobal('AbortController', window.AbortController);
    const video = document.querySelector('video');
    if (!video) throw new Error('Missing video');
    adapter = new ScreenCaptionAdapter(video, SELECTOR);
    onCaptionsChange = vi.fn<() => void>();
    onFailure = vi.fn<(error: unknown) => void>();
    adapter.start({ onCaptionsChange, onControlsLift: vi.fn(), onFailure });
  });

  afterEach(() => {
    adapter.stop();
    vi.unstubAllGlobals();
  });

  function showLines(...lines: string[]): void {
    const captions = document.querySelector('.fp-captions');
    captions?.replaceChildren(
      ...lines.map((line) => {
        const span = document.createElement('span');
        span.className = 'fp-line';
        span.textContent = line;
        return span;
      }),
    );
  }

  async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  function texts(): string[] {
    return adapter.activeCues().map((cue) => cue.text);
  }

  it('waits until the site draws its first caption', () => {
    expect(adapter.status()).toBe('waiting');
    expect(texts()).toEqual([]);
  });

  it('reads the lines the site draws, as one English cue, and asks for a new drawing', async () => {
    showLines('Hello, this is', 'the test page.');
    await settle();
    expect(adapter.status()).toBe('screen');
    expect(texts()).toEqual(['Hello, this is\nthe test page.']);
    expect(adapter.activeCues()[0]?.lang).toBe('en');
    expect(onCaptionsChange).toHaveBeenCalled();
  });

  it('keeps reading the screen between two lines and after the site replaces them', async () => {
    showLines('First line');
    await settle();
    showLines();
    await settle();
    expect(adapter.status()).toBe('screen');
    expect(texts()).toEqual([]);

    showLines('Second line');
    await settle();
    expect(texts()).toEqual(['Second line']);
  });

  it('gives each new line its own cue, so the translation follows it', async () => {
    showLines('First line');
    await settle();
    const first = adapter.activeCues()[0]?.id;
    showLines('Second line');
    await settle();
    expect(adapter.activeCues()[0]?.id).not.toBe(first);
  });

  it('hides the lines of the site while the extension shows its own, and gives them back', async () => {
    showLines('Hello');
    await settle();
    adapter.hideSiteCaptions(true);
    const line = document.querySelector<HTMLElement>('.fp-line');
    expect(line?.style.visibility).toBe('hidden');

    adapter.stop();
    expect(line?.style.visibility).toBe('');
  });

  it('stops reading the screen once stopped', async () => {
    adapter.stop();
    showLines('Too late');
    await settle();
    expect(texts()).toEqual([]);
  });

  it('throws on start when the stored selector is not valid any more', () => {
    const video = document.querySelector('video');
    if (!video) throw new Error('Missing video');
    const broken = new ScreenCaptionAdapter(video, 'div.fp-captions span[');

    expect(() => {
      broken.start({ onCaptionsChange, onControlsLift: vi.fn(), onFailure });
    }).toThrow();
  });

  it('hands an error while reading the page to the session', async () => {
    const error = new Error('Page changed under us');
    vi.spyOn(document, 'querySelectorAll').mockImplementation(() => {
      throw error;
    });
    showLines('Hello');
    await Promise.resolve();

    expect(onFailure).toHaveBeenCalledWith(error);
  });
});
