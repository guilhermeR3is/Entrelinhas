import { JSDOM } from 'jsdom';
import { beforeEach, describe, expect, it } from 'vitest';
import { SubtitleOverlay } from '../overlay/subtitle-overlay';
import { SubtitleTrack } from '../subtitles/subtitle-track';
import { StudyControls } from './study-controls';

class FakeVideo extends EventTarget {
  playbackRate = 1;
  paused = false;

  pause(): void {
    this.paused = true;
  }

  play(): void {
    this.paused = false;
    this.dispatchEvent(new Event('playing'));
  }
}

const TRACK = new SubtitleTrack([
  { id: 0, startMs: 0, endMs: 2000, text: 'Hello there.', lang: 'en' },
  { id: 1, startMs: 2000, endMs: 4000, text: 'Bye.', lang: 'en' },
]);

describe('StudyControls', () => {
  let video: FakeVideo;
  let container: HTMLElement;
  let controls: StudyControls;

  beforeEach(() => {
    container = new JSDOM().window.document.body;
    const overlay = new SubtitleOverlay(container);
    video = new FakeVideo();
    controls = new StudyControls(video as unknown as HTMLVideoElement, overlay, () => false);
  });

  function autoPauseButton(): HTMLElement {
    const button = container.querySelector<HTMLElement>('.strip .separated');
    if (!button) throw new Error('Missing auto-pause button');
    return button;
  }

  it('shows the speed and the auto-pause switch on the strip', () => {
    controls.handle('slower');
    expect(video.playbackRate).toBe(0.95);
    expect(container.querySelector('.speed')?.textContent).toBe('0,95x');
    expect(autoPauseButton().getAttribute('aria-pressed')).toBe('false');
    controls.handle('auto-pause');
    expect(autoPauseButton().getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('.strip')?.classList.contains('shown')).toBe(false);
  });

  it('pauses at the end of the sentence and keeps showing it until the video plays again', () => {
    controls.handle('auto-pause');
    controls.followSentences(TRACK, 1990);
    controls.followSentences(TRACK, 2012);
    expect(video.paused).toBe(true);
    expect(controls.isFrozen).toBe(true);
    expect(controls.displayTimeMs(2012)).toBe(1999);
    expect(TRACK.activeAt(controls.displayTimeMs(2012))[0]?.text).toBe('Hello there.');

    video.play();
    expect(controls.isFrozen).toBe(false);
    expect(controls.displayTimeMs(2030)).toBe(2030);
  });

  it('lets the video run past the end while switched off', () => {
    controls.followSentences(TRACK, 1990);
    controls.followSentences(TRACK, 2012);
    expect(video.paused).toBe(false);
  });

  it('does not pause a video that is already paused', () => {
    controls.handle('auto-pause');
    video.pause();
    controls.followSentences(TRACK, 1990);
    controls.followSentences(TRACK, 2012);
    expect(controls.isFrozen).toBe(false);
  });

  it('forgets the pause and the last frame after a seek', () => {
    controls.handle('auto-pause');
    controls.followSentences(TRACK, 1990);
    controls.followSentences(TRACK, 2012);
    video.dispatchEvent(new Event('seeked'));
    expect(controls.isFrozen).toBe(false);

    video.paused = false;
    controls.followSentences(TRACK, 3995);
    expect(video.paused).toBe(false);
  });

  it('does not pause when a short seek jumps over the end of a sentence', () => {
    controls.handle('auto-pause');
    controls.followSentences(TRACK, 1900);
    video.dispatchEvent(new Event('seeked'));
    controls.followSentences(TRACK, 2500);
    expect(video.paused).toBe(false);
  });

  it('pauses when the line read from the screen changes', () => {
    controls.handle('auto-pause');
    controls.followLine('Hello');
    controls.followLine('Hello there');
    expect(video.paused).toBe(true);
    expect(controls.isFrozen).toBe(true);
    expect(controls.displayTimeMs(5000)).toBe(5000);
  });
});
