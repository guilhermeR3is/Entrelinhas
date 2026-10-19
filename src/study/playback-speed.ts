export const MIN_SPEED = 0.5;
export const MAX_SPEED = 2;
const STEPS_PER_UNIT = 20;
const RESET_LIMIT = 3;
const RESET_WINDOW_MS = 2000;

type SpeedTarget = EventTarget & { playbackRate: number };

export type PlaybackSpeedOptions = {
  onChange: (speed: number) => void;
  personChangedSpeed: () => boolean;
  now?: () => number;
};

export function stepSpeed(speed: number, steps: number): number {
  return clampSpeed(Math.round(speed * STEPS_PER_UNIT + steps) / STEPS_PER_UNIT);
}

function clampSpeed(speed: number): number {
  return Math.min(MAX_SPEED, Math.max(MIN_SPEED, speed));
}

export class PlaybackSpeed {
  private chosen: number;
  private held = false;
  private resetTimes: number[] = [];
  private readonly listeners = new AbortController();
  private readonly now: () => number;

  constructor(
    private readonly video: SpeedTarget,
    private readonly options: PlaybackSpeedOptions,
  ) {
    this.chosen = video.playbackRate;
    this.now = options.now ?? (() => performance.now());
    video.addEventListener('ratechange', this.follow, { signal: this.listeners.signal });
  }

  get speed(): number {
    return this.chosen;
  }

  step(steps: number): void {
    this.choose(stepSpeed(this.chosen, steps));
  }

  choose(speed: number): void {
    this.chosen = clampSpeed(speed);
    this.resetTimes = [];
    if (!this.held) this.video.playbackRate = this.chosen;
    this.options.onChange(this.chosen);
  }

  setHeld(held: boolean): void {
    if (held === this.held) return;
    this.held = held;
    if (!held && this.video.playbackRate !== this.chosen) this.video.playbackRate = this.chosen;
  }

  stop(): void {
    this.listeners.abort();
  }

  private readonly follow = (): void => {
    const actual = this.video.playbackRate;
    if (this.held || actual === this.chosen) return;
    if (this.options.personChangedSpeed() || this.playerKeepsResetting()) {
      this.chosen = actual;
      this.resetTimes = [];
      this.options.onChange(actual);
      return;
    }
    this.video.playbackRate = this.chosen;
  };

  private playerKeepsResetting(): boolean {
    const now = this.now();
    this.resetTimes = [...this.resetTimes.filter((time) => now - time < RESET_WINDOW_MS), now];
    return this.resetTimes.length >= RESET_LIMIT;
  }
}
