import type { PlayerAdapter, PlayerEvents } from '../session/player-adapter';
import { watchNativeControls } from './native-controls';
import { SpeedChoice } from './speed-choice';
import type { CaptionStatus } from '../subtitles/caption-status';
import type { Cue } from '../subtitles/cue';
import { SubtitleTrack } from '../subtitles/subtitle-track';

export const MAX_DELAY_MS = 10 * 60 * 1000;

export class FileTrackAdapter implements PlayerAdapter {
  private readonly siteModes = new Map<TextTrack, TextTrackMode>();
  private shownTrack: SubtitleTrack;
  private currentDelayMs = 0;
  private onCaptionsChange: () => void = () => undefined;
  private stopControls: () => void = () => undefined;
  private speedChoice: SpeedChoice | undefined;

  constructor(
    private readonly media: HTMLVideoElement,
    private readonly fileCues: readonly Cue[],
  ) {
    this.shownTrack = new SubtitleTrack(fileCues);
  }

  get player(): Element {
    return this.media;
  }

  get delayMs(): number {
    return this.currentDelayMs;
  }

  start(events: PlayerEvents): void {
    this.onCaptionsChange = events.onCaptionsChange;
    this.stopControls = watchNativeControls(this.media, events.onControlsLift);
    this.speedChoice = new SpeedChoice(this.media, navigator.userActivation);
  }

  stop(): void {
    this.onCaptionsChange = () => undefined;
    this.stopControls();
    this.speedChoice?.stop();
    for (const [track, mode] of this.siteModes) track.mode = mode;
    this.siteModes.clear();
  }

  shiftDelay(byMs: number): number {
    const delayMs = Math.min(MAX_DELAY_MS, Math.max(-MAX_DELAY_MS, this.currentDelayMs + byMs));
    if (delayMs === this.currentDelayMs) return delayMs;
    this.currentDelayMs = delayMs;
    this.shownTrack = new SubtitleTrack(
      this.fileCues.map((cue) => ({
        ...cue,
        startMs: cue.startMs + delayMs,
        endMs: cue.endMs + delayMs,
      })),
    );
    this.onCaptionsChange();
    return delayMs;
  }

  video(): HTMLVideoElement {
    return this.media;
  }

  videoKey(): string | null {
    return this.media.currentSrc || null;
  }

  isShowingAd(): boolean {
    return false;
  }

  personChangedSpeed(): boolean {
    return this.speedChoice?.personChangedSpeed() ?? false;
  }

  status(): CaptionStatus {
    return 'full-track';
  }

  activeCues(timeMs: number): readonly Cue[] {
    return this.shownTrack.activeAt(timeMs);
  }

  englishTrack(): SubtitleTrack {
    return this.shownTrack;
  }

  officialPortugueseTrack(): null {
    return null;
  }

  hideSiteCaptions(hidden: boolean): void {
    if (!hidden) return;
    for (const track of Array.from(this.media.textTracks)) {
      if (track.mode !== 'showing') continue;
      this.siteModes.set(track, track.mode);
      track.mode = 'hidden';
    }
  }
}
