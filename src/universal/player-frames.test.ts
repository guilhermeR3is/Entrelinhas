import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { choosePlayerFrame, measureFrames } from './player-frames';

const PAGE = 'https://www.cursos.com.br/aula/3';

function frame(src: string, width = 640, height = 360) {
  return { src, width, height };
}

describe('choosePlayerFrame', () => {
  it('names the largest frame of another address as the player', () => {
    expect(
      choosePlayerFrame(
        [
          frame('https://ads.example.net/slot', 300, 250),
          frame('https://player.vimeo.com/video/9', 854, 480),
          frame('https://chat.example.org/widget', 400, 600),
        ],
        PAGE,
      ),
    ).toEqual({ player: 'player.vimeo.com', playerOrigin: 'https://player.vimeo.com/*' });
  });

  it('shows an accented address the way people write it', () => {
    expect(choosePlayerFrame([frame('https://www.xn--vdeos-zsa.com/embed/1')], PAGE)).toEqual({
      player: 'vídeos.com',
      playerOrigin: 'https://www.xn--vdeos-zsa.com/*',
    });
  });

  it.each([
    ['too small for a player', frame('https://player.vimeo.com/video/9', 300, 250)],
    ['hidden', frame('https://player.vimeo.com/video/9', 0, 0)],
    ['from the page itself', frame('https://www.cursos.com.br/player/9')],
    ['YouTube, which has its own adapter', frame('https://www.youtube.com/embed/abc')],
    ['without https', frame('http://player.example.net/9')],
    ['empty', frame('about:blank')],
  ])('ignores a frame that is %s', (_case, ignored) => {
    expect(choosePlayerFrame([ignored], PAGE)).toBeNull();
  });

  it('ignores whatever the page sent back that is not a list of frames', () => {
    expect(choosePlayerFrame({ src: 'https://player.vimeo.com/' }, PAGE)).toBeNull();
    expect(choosePlayerFrame(undefined, PAGE)).toBeNull();
    expect(choosePlayerFrame([frame('https://player.vimeo.com/9')], 'not a url')).toBeNull();
  });
});

describe('measureFrames', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('finds the frames hidden inside the shadow roots of components', () => {
    const { window } = new JSDOM(
      '<iframe src="https://ads.example.net/slot"></iframe><interactive-example></interactive-example>',
    );
    const outer = window.document
      .querySelector('interactive-example')
      ?.attachShadow({ mode: 'open' });
    const inner = window.document.createElement('play-runner');
    outer?.append(inner);
    const frame = window.document.createElement('iframe');
    frame.src = 'https://player.example.org/embed/1';
    inner.attachShadow({ mode: 'open' }).append(frame);
    vi.stubGlobal('document', window.document);
    vi.stubGlobal('HTMLIFrameElement', window.HTMLIFrameElement);
    vi.stubGlobal('getComputedStyle', window.getComputedStyle.bind(window));

    expect(measureFrames().map((measured) => measured.src)).toEqual([
      'https://ads.example.net/slot',
      'https://player.example.org/embed/1',
    ]);
  });
});
