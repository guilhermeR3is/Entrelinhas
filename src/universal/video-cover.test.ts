import { JSDOM } from 'jsdom';
import { afterEach, expect, it, vi } from 'vitest';
import { coverVideo } from './video-cover';

afterEach(() => {
  vi.unstubAllGlobals();
});

it('places the box over the video and follows its size', () => {
  const { document } = new JSDOM('<div><video></video><div class="box"></div></div>').window;
  const video = document.querySelector('video');
  const box = document.querySelector<HTMLElement>('.box');
  if (!video || !box) throw new Error('Missing elements');
  const layout = { offsetLeft: 16, offsetTop: 40, offsetWidth: 480, offsetHeight: 270 };
  for (const name of Object.keys(layout) as (keyof typeof layout)[]) {
    Object.defineProperty(video, name, { get: () => layout[name] });
  }
  let onResize: () => void = () => undefined;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        onResize = callback;
      }
      observe = vi.fn();
    },
  );

  coverVideo(box, video);
  expect(box.style.cssText).toBe(
    'position: absolute; pointer-events: none; left: 16px; top: 40px; width: 480px; height: 270px;',
  );

  Object.assign(layout, { offsetWidth: 1280, offsetHeight: 720 });
  onResize();
  expect(box.style.width).toBe('1280px');
  expect(box.style.height).toBe('720px');
});
