import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { observeScreenCaptions } from './caption-observer';

const PLAYER_HTML = `
  <div id="ytp-caption-window-container">
    <div class="caption-window">
      <span class="captions-text">
        <span class="caption-visual-line"><span class="ytp-caption-segment">Hello </span></span>
        <span class="caption-visual-line"><span class="ytp-caption-segment">there</span></span>
      </span>
    </div>
  </div>`;

function nextMutations(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve));
}

describe('observeScreenCaptions', () => {
  let document: Document;
  let container: Element;
  let observer: MutationObserver | undefined;
  const onText = vi.fn();

  beforeEach(() => {
    const { window } = new JSDOM(PLAYER_HTML);
    vi.stubGlobal('MutationObserver', window.MutationObserver);
    document = window.document;
    container = document.querySelector('#ytp-caption-window-container') ?? document.body;
    onText.mockClear();
  });

  afterEach(() => {
    observer?.disconnect();
    vi.unstubAllGlobals();
  });

  function lineSegments(): Element[] {
    return Array.from(container.querySelectorAll('.ytp-caption-segment'));
  }

  it('reads the caption already on screen, one line per visual line', () => {
    observer = observeScreenCaptions(container, onText);
    expect(onText).toHaveBeenCalledExactlyOnceWith('Hello\nthere');
  });

  it('reports a new caption when the player rewrites the text', async () => {
    observer = observeScreenCaptions(container, onText);
    const [first] = lineSegments();
    if (first?.firstChild) first.firstChild.textContent = 'Goodbye';
    await nextMutations();
    expect(onText).toHaveBeenLastCalledWith('Goodbye\nthere');
  });

  it('does not report the same caption twice when the player redraws it', async () => {
    observer = observeScreenCaptions(container, onText);
    const captionWindow = container.querySelector('.caption-window');
    if (captionWindow) container.replaceChildren(captionWindow.cloneNode(true));
    await nextMutations();
    expect(onText).toHaveBeenCalledOnce();
  });

  it('reports an empty caption when the lines disappear', async () => {
    observer = observeScreenCaptions(container, onText);
    container.replaceChildren();
    await nextMutations();
    expect(onText).toHaveBeenLastCalledWith('');
  });

  it('stops reading once disconnected', async () => {
    observer = observeScreenCaptions(container, onText);
    observer.disconnect();
    container.replaceChildren();
    await nextMutations();
    expect(onText).toHaveBeenCalledOnce();
  });
});
