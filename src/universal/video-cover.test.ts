import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { coverVideo, type VideoCover } from './video-cover';

describe('coverVideo', () => {
  let window: JSDOM['window'];
  let document: Document;
  let video: HTMLVideoElement;
  let box: HTMLElement;
  let fullscreen: Element | null;
  let onResize: () => void;
  let cover: VideoCover;
  let showPopover: ReturnType<typeof vi.fn>;
  let hidePopover: ReturnType<typeof vi.fn>;
  const layout = { offsetLeft: 16, offsetTop: 40, offsetWidth: 480, offsetHeight: 270 };

  beforeEach(() => {
    window = new JSDOM('<div class="player"><video></video><div class="box"></div></div>').window;
    document = window.document;
    const foundVideo = document.querySelector('video');
    const foundBox = document.querySelector<HTMLElement>('.box');
    if (!foundVideo || !foundBox) throw new Error('Missing elements');
    video = foundVideo;
    box = foundBox;
    Object.assign(layout, { offsetWidth: 480, offsetHeight: 270 });
    for (const name of Object.keys(layout) as (keyof typeof layout)[]) {
      Object.defineProperty(video, name, { get: () => layout[name] });
    }
    fullscreen = null;
    Object.defineProperty(document, 'fullscreenElement', { get: () => fullscreen });
    showPopover = vi.fn();
    hidePopover = vi.fn();
    Object.assign(box, { showPopover, hidePopover });
    onResize = () => undefined;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          onResize = callback;
        }
        observe = vi.fn();
        disconnect = vi.fn();
      },
    );
    cover = coverVideo(box, video);
  });

  afterEach(() => {
    cover.disconnect();
    vi.unstubAllGlobals();
  });

  function enterFullscreen(element: Element | null): void {
    fullscreen = element;
    document.dispatchEvent(new window.Event('fullscreenchange'));
  }

  it('places the box over the video and follows its size', () => {
    expect(box.style.cssText).toBe(
      'position: absolute; pointer-events: none; left: 16px; top: 40px; width: 480px; height: 270px;',
    );

    Object.assign(layout, { offsetWidth: 1280, offsetHeight: 720 });
    onResize();
    expect(box.style.width).toBe('1280px');
    expect(box.style.height).toBe('720px');
  });

  it('goes to the top layer over the whole screen while the video is full screen alone', () => {
    enterFullscreen(video);

    expect(showPopover).toHaveBeenCalledOnce();
    expect(box.getAttribute('popover')).toBe('manual');
    expect(box.classList.contains('video-fullscreen')).toBe(true);
    expect(box.style).toMatchObject({
      position: 'fixed',
      left: '0px',
      top: '0px',
      width: '100vw',
      height: '100vh',
      margin: '0px',
      background: 'none',
    });
  });

  it('comes back over the video when the full screen ends', () => {
    enterFullscreen(video);
    enterFullscreen(null);

    expect(hidePopover).toHaveBeenCalledOnce();
    expect(box.hasAttribute('popover')).toBe(false);
    expect(box.classList.contains('video-fullscreen')).toBe(false);
    expect(box.style).toMatchObject({
      position: 'absolute',
      left: '16px',
      top: '40px',
      width: '480px',
      height: '270px',
      margin: '',
      background: '',
    });
  });

  it('stays in place when the site puts its whole player in full screen', () => {
    enterFullscreen(document.querySelector('.player'));

    expect(showPopover).not.toHaveBeenCalled();
    expect(box.style.position).toBe('absolute');
  });

  it('opens the top layer once even when the video resizes during the full screen', () => {
    enterFullscreen(video);
    onResize();

    expect(showPopover).toHaveBeenCalledOnce();
  });

  it('leaves the top layer when it stops covering the video', () => {
    enterFullscreen(video);
    cover.disconnect();
    enterFullscreen(null);

    expect(hidePopover).toHaveBeenCalledOnce();
    expect(box.hasAttribute('popover')).toBe(false);
  });
});
