import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { captionSelector } from './caption-selector';

function clickedIn(html: string, selector = '[data-clicked]'): Element {
  const { document } = new JSDOM(`<body>${html}</body>`).window;
  const clicked = document.querySelector(selector);
  if (!clicked) throw new Error('Missing the clicked element');
  return clicked;
}

describe('captionSelector', () => {
  it('scopes the line class with the class of its caption container (Plyr style)', () => {
    const clicked = clickedIn(
      '<div class="plyr__captions"><span class="plyr__caption" data-clicked>Hi</span></div>',
    );
    expect(captionSelector(clicked)).toBe('div.plyr__captions span.plyr__caption');
  });

  it('uses the nearest container with a class when the clicked text has none (video.js style)', () => {
    const clicked = clickedIn(
      '<div class="vjs-text-track-display"><div><div class="vjs-text-track-cue"><div data-clicked>Hi</div></div></div></div>',
    );
    expect(captionSelector(clicked)).toBe('div.vjs-text-track-cue div');
  });

  it('prefers a stable id over any class', () => {
    const clicked = clickedIn('<div id="captions" class="layer" data-clicked>Hi</div>');
    expect(captionSelector(clicked)).toBe('#captions');
  });

  it('scopes with an id of the container when the container has one', () => {
    const clicked = clickedIn('<div id="subtitle-box"><p data-clicked>Hi</p></div>');
    expect(captionSelector(clicked)).toBe('#subtitle-box p');
  });

  it('skips classes that look generated or that only describe a state', () => {
    const clicked = clickedIn(
      '<div class="css-1x2y3z player-captions is-active"><span class="sc-bdVaJa line active x9a8b7" data-clicked>Hi</span></div>',
    );
    expect(captionSelector(clicked)).toBe('div.player-captions span.line');
  });

  it('skips ids made of numbers, like the ones some players create on every load', () => {
    const clicked = clickedIn(
      '<div class="jw-captions"><div id="cue-1729" class="jw-text-track-cue" data-clicked>Hi</div></div>',
    );
    expect(captionSelector(clicked)).toBe('div.jw-captions div.jw-text-track-cue');
  });

  it('gives up when nothing around the text has a stable name', () => {
    const clicked = clickedIn('<div><div><span data-clicked>Hi</span></div></div>');
    expect(captionSelector(clicked)).toBeNull();
  });

  it('still learns a line with its own class when the containers have none', () => {
    const clicked = clickedIn('<div><span class="subtitle-line" data-clicked>Hi</span></div>');
    expect(captionSelector(clicked)).toBe('span.subtitle-line');
  });
});
