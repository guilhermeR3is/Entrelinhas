import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SubtitleOverlay } from '../overlay/subtitle-overlay';
import { SubtitleTrack } from '../subtitles/subtitle-track';
import { StudyControls } from './study-controls';

class FakeVideo extends EventTarget {
  playbackRate = 1;
  paused = false;
  currentTime = 0;

  pause(): void {
    this.paused = true;
  }

  play(): Promise<void> {
    this.paused = false;
    this.dispatchEvent(new Event('playing'));
    return Promise.resolve();
  }

  finishSeek(): void {
    this.dispatchEvent(new Event('seeked'));
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

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe = vi.fn();
      },
    );
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

  it('switches the blur with B and reveals the sentence with V', () => {
    controls.handle('blur');
    expect(container.querySelector('.box')?.classList.contains('blurred')).toBe(true);
    controls.handle('reveal');
    expect(container.querySelector('.portuguese')?.classList.contains('revealed')).toBe(true);
    controls.handle('blur');
    expect(container.querySelector('.box')?.classList.contains('blurred')).toBe(false);
  });

  it('pauses at the end of the sentence and keeps showing it until the video plays again', () => {
    controls.handle('auto-pause');
    controls.followSentences(TRACK, 1990);
    controls.followSentences(TRACK, 2012);
    expect(video.paused).toBe(true);
    expect(controls.isFrozen).toBe(true);
    expect(controls.displayTimeMs(2012)).toBe(1999);
    expect(TRACK.activeAt(controls.displayTimeMs(2012))[0]?.text).toBe('Hello there.');

    void video.play();
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
    controls.followLine('Hello', 0);
    controls.followLine('Hello there', 1000);
    expect(video.paused).toBe(true);
    expect(controls.isFrozen).toBe(true);
    expect(controls.displayTimeMs(5000)).toBe(5000);
  });

  describe('repeating', () => {
    function repeatButton(): HTMLElement {
      const button = container.querySelectorAll<HTMLElement>('.strip button:not(.handle)')[3];
      if (!button) throw new Error('Missing repeat button');
      return button;
    }

    it('goes back to the start of the sentence on screen and plays it', () => {
      video.paused = true;
      controls.followSentences(TRACK, 2500);
      controls.handle('repeat');
      expect(video.currentTime).toBe(2);
      expect(video.paused).toBe(false);
    });

    it('repeats the sentence that auto-pause kept on screen', () => {
      controls.handle('auto-pause');
      controls.followSentences(TRACK, 1990);
      controls.followSentences(TRACK, 2012);
      controls.handle('repeat');
      expect(video.currentTime).toBe(0);
    });

    it('has nothing to repeat before the first sentence', () => {
      const late = new SubtitleTrack([
        { id: 0, startMs: 1000, endMs: 2000, text: 'Late.', lang: 'en' },
      ]);
      expect(repeatButton().getAttribute('aria-disabled')).toBe('true');
      controls.followSentences(late, 500);
      video.currentTime = 0.5;
      controls.handle('repeat');
      expect(video.currentTime).toBe(0.5);

      controls.followSentences(late, 1500);
      expect(repeatButton().getAttribute('aria-disabled')).toBe('false');
    });

    it('repeats slowly and gives the speed back when the sentence ends', () => {
      controls.handle('faster');
      controls.handle('faster');
      controls.followSentences(TRACK, 2500);
      controls.handle('repeat-slow');
      expect(video.playbackRate).toBe(0.75);
      expect(video.currentTime).toBe(2);
      controls.followSentences(TRACK, 2500);
      video.finishSeek();
      controls.followSentences(TRACK, 3000);
      expect(video.playbackRate).toBe(0.75);
      controls.followSentences(TRACK, 4000);
      expect(video.playbackRate).toBe(1.1);
    });

    it('gives the speed back when the person seeks away from the slow repeat', () => {
      controls.followSentences(TRACK, 2500);
      controls.handle('repeat-slow');
      video.finishSeek();
      video.finishSeek();
      expect(video.playbackRate).toBe(1);
    });

    it('keeps a speed the person picks during the slow repeat', () => {
      controls.followSentences(TRACK, 2500);
      controls.handle('repeat-slow');
      video.finishSeek();
      controls.handle('slower');
      controls.followSentences(TRACK, 4000);
      expect(video.playbackRate).toBe(0.7);
    });

    it('counts a sentence as on screen from the exact instant it starts', () => {
      controls.followSentences(TRACK, 2000);
      controls.handle('repeat');
      expect(video.currentTime).toBe(2);
    });

    it('gives back the speed from before the first slow repeat when pressed twice', () => {
      controls.handle('faster');
      controls.handle('faster');
      controls.followSentences(TRACK, 2500);
      controls.handle('repeat-slow');
      video.finishSeek();
      controls.handle('repeat-slow');
      video.finishSeek();
      controls.followSentences(TRACK, 4000);
      expect(video.playbackRate).toBe(1.1);
    });

    it('waits for its own seek before checking the end of the slow repeat', () => {
      controls.followSentences(TRACK, 3990);
      controls.handle('repeat-slow');
      controls.followSentences(TRACK, 4005);
      expect(video.playbackRate).toBe(0.75);
    });

    it('ends the slow repeat of a screen line when the next line shows up', () => {
      controls.followLine('First', 1000);
      controls.handle('repeat-slow');
      video.finishSeek();
      controls.followLine('First', 1000);
      expect(video.playbackRate).toBe(0.75);
      controls.followLine('Second', 3000);
      expect(video.playbackRate).toBe(1);
    });

    it('goes back to when the line read from the screen appeared', () => {
      video.paused = true;
      controls.followLine('First', 1000);
      controls.followLine('Second', 3000);
      controls.handle('repeat');
      expect(video.currentTime).toBe(3);
    });

    it('goes back to the line auto-pause kept when the screen moved on', () => {
      controls.handle('auto-pause');
      controls.followLine('First', 1000);
      controls.followLine('Second', 3000);
      controls.handle('repeat');
      expect(video.currentTime).toBe(1);
    });
  });
});
