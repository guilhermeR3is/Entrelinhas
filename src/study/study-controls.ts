import type { SubtitleOverlay } from '../overlay/subtitle-overlay';
import type { SubtitleTrack } from '../subtitles/subtitle-track';
import { AutoPause } from './auto-pause';
import { PlaybackSpeed } from './playback-speed';
import type { StudyCommand } from './study-keys';

export class StudyControls {
  private readonly speed: PlaybackSpeed;
  private readonly autoPause = new AutoPause();
  private readonly listeners = new AbortController();
  private frozenAtMs: number | null = null;
  private frozen = false;

  constructor(
    private readonly video: HTMLVideoElement,
    private readonly overlay: SubtitleOverlay,
    personChangedSpeed: () => boolean,
  ) {
    this.speed = new PlaybackSpeed(video, {
      personChangedSpeed,
      onChange: (speed) => {
        overlay.setSpeed(speed);
      },
    });
    overlay.setSpeed(this.speed.speed);
    overlay.setAutoPause(this.autoPause.enabled);

    const signal = this.listeners.signal;
    video.addEventListener('playing', this.thaw, { signal });
    video.addEventListener(
      'seeked',
      () => {
        this.thaw();
        this.autoPause.restart();
      },
      { signal },
    );
  }

  get isFrozen(): boolean {
    return this.frozen;
  }

  handle(command: StudyCommand): void {
    switch (command) {
      case 'slower':
        this.speed.step(-1);
        break;
      case 'faster':
        this.speed.step(1);
        break;
      case 'auto-pause':
        this.overlay.setAutoPause(this.autoPause.toggle());
        break;
    }
    this.overlay.flashStrip();
  }

  setHeld(held: boolean): void {
    this.speed.setHeld(held);
  }

  displayTimeMs(timeMs: number): number {
    return this.frozenAtMs ?? timeMs;
  }

  followSentences(track: SubtitleTrack, timeMs: number): void {
    const end = this.autoPause.sentenceEndCrossed(track, timeMs);
    if (end !== null && !this.video.paused) this.freeze(end - 1);
  }

  followLine(line: string): void {
    if (this.autoPause.lineEnded(line) && !this.video.paused) this.freeze(null);
  }

  stop(): void {
    this.listeners.abort();
    this.speed.stop();
  }

  private freeze(atMs: number | null): void {
    this.frozen = true;
    this.frozenAtMs = atMs;
    this.video.pause();
  }

  private readonly thaw = (): void => {
    this.frozen = false;
    this.frozenAtMs = null;
  };
}
