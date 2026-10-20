import { describe, expect, it } from 'vitest';
import { choosePlayerFrame } from './player-frames';

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
