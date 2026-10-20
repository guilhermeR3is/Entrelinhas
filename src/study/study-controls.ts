import { logger } from '../logger';
import type { SubtitleOverlay } from '../overlay/subtitle-overlay';
import type { Cue } from '../subtitles/cue';
import type { SubtitleTrack } from '../subtitles/subtitle-track';
import { groupSentences } from '../translation/sentence-groups';
import { AutoPause } from './auto-pause';
import { PlaybackSpeed } from './playback-speed';
import type { StudyCommand } from './study-keys';

const SLOW_REPEAT_SPEED = 0.75;

type RepeatTarget = { startMs: number; endMs: number | null; line: string | null };
type SlowRepeat = { restoreSpeed: number; endMs: number | null; line: string | null };

export class StudyControls {
  private readonly speed: PlaybackSpeed;
  private readonly autoPause = new AutoPause();
  private readonly listeners = new AbortController();
  private frozenAtMs: number | null = null;
  private frozen = false;
  private sentenceTrack: SubtitleTrack | null = null;
  private sentences: readonly Cue[] = [];
  private line = '';
  private lineStartMs: number | null = null;
  private previousLine = '';
  private previousLineStartMs: number | null = null;
  private repeatTarget: RepeatTarget | null = null;
  private slowRepeat: SlowRepeat | null = null;
  private seekingToRepeat = false;
  private blurred = false;

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
    overlay.setRepeatAvailable(false);
    overlay.setBlurred(this.blurred);

    const signal = this.listeners.signal;
    video.addEventListener('playing', this.thaw, { signal });
    video.addEventListener('seeked', this.followSeek, { signal });
  }

  get isFrozen(): boolean {
    return this.frozen;
  }

  handle(command: StudyCommand): void {
    switch (command) {
      case 'slower':
      case 'faster':
        this.slowRepeat = null;
        this.speed.step(command === 'faster' ? 1 : -1);
        break;
      case 'auto-pause':
        this.overlay.setAutoPause(this.autoPause.toggle());
        break;
      case 'repeat':
        this.repeat(false);
        break;
      case 'repeat-slow':
        this.repeat(true);
        break;
      case 'blur':
        this.blurred = !this.blurred;
        this.overlay.setBlurred(this.blurred);
        break;
      case 'reveal':
        this.overlay.revealPortuguese();
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
    if (track !== this.sentenceTrack) {
      this.sentenceTrack = track;
      this.sentences = groupSentences(track.cues).toSorted((a, b) => a.startMs - b.startMs);
    }
    const end = this.autoPause.sentenceEndCrossed(track, timeMs);
    if (end !== null && !this.video.paused) this.freeze(end - 1);

    const slowEndMs = this.slowRepeat?.endMs;
    if (slowEndMs != null && !this.seekingToRepeat && timeMs >= slowEndMs) this.endSlowRepeat();

    const sentence = lastStartedBy(this.sentences, this.displayTimeMs(timeMs));
    this.setRepeatTarget(
      sentence ? { startMs: sentence.startMs, endMs: sentence.endMs, line: null } : null,
    );
  }

  followLine(line: string, timeMs: number): void {
    if (line !== this.line) {
      this.previousLine = this.line;
      this.previousLineStartMs = this.lineStartMs;
      this.line = line;
      this.lineStartMs = line ? timeMs : null;
      const slowLine = this.slowRepeat?.line;
      if (slowLine != null && line !== '' && line !== slowLine) this.endSlowRepeat();
    }
    if (this.autoPause.lineEnded(line) && !this.video.paused) this.freeze(null);

    const showsCurrent = !this.frozen && this.line !== '';
    const shownLine = showsCurrent ? this.line : this.previousLine;
    const startMs = showsCurrent ? this.lineStartMs : this.previousLineStartMs;
    this.setRepeatTarget(
      shownLine && startMs !== null ? { startMs, endMs: null, line: shownLine } : null,
    );
  }

  stop(): void {
    this.listeners.abort();
    this.speed.stop();
  }

  private repeat(slowly: boolean): void {
    const target = this.repeatTarget;
    if (!target) return;
    if (slowly) {
      this.slowRepeat = {
        restoreSpeed: this.slowRepeat?.restoreSpeed ?? this.speed.speed,
        endMs: target.endMs,
        line: target.line,
      };
      this.speed.choose(SLOW_REPEAT_SPEED);
    }
    this.seekingToRepeat = true;
    this.video.currentTime = target.startMs / 1000;
    if (this.video.paused) {
      this.video.play().catch((error: unknown) => {
        logger.error('Could not play the repeated sentence', error);
      });
    }
  }

  private endSlowRepeat(): void {
    if (!this.slowRepeat) return;
    this.speed.choose(this.slowRepeat.restoreSpeed);
    this.slowRepeat = null;
  }

  private setRepeatTarget(target: RepeatTarget | null): void {
    if ((target === null) !== (this.repeatTarget === null)) {
      this.overlay.setRepeatAvailable(target !== null);
    }
    this.repeatTarget = target;
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

  private readonly followSeek = (): void => {
    this.thaw();
    this.autoPause.restart();
    if (this.seekingToRepeat) this.seekingToRepeat = false;
    else this.endSlowRepeat();
  };
}

function lastStartedBy(sentences: readonly Cue[], timeMs: number): Cue | undefined {
  let low = 0;
  let high = sentences.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    const sentence = sentences[middle];
    if (sentence !== undefined && sentence.startMs <= timeMs) low = middle + 1;
    else high = middle;
  }
  return sentences[low - 1];
}
