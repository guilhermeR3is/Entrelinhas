import type { CaptionStatus } from '../subtitles/caption-status';
import type { Cue } from '../subtitles/cue';
import type { SubtitleTrack } from '../subtitles/subtitle-track';

export type PlayerEvents = {
  onCaptionsChange: () => void;
  onControlsLift: (liftPx: number) => void;
  onFailure: (error: unknown) => void;
};

export interface PlayerAdapter {
  readonly player: Element;
  readonly delayMs?: number;
  start(events: PlayerEvents): void;
  stop(): void;
  video(): HTMLVideoElement | null;
  videoKey(): string | null;
  isShowingAd(): boolean;
  personChangedSpeed(): boolean;
  status(): CaptionStatus;
  activeCues(timeMs: number): readonly Cue[];
  englishTrack(): SubtitleTrack | null;
  officialPortugueseTrack(): SubtitleTrack | null;
  hideSiteCaptions(hidden: boolean): void;
  shiftDelay?(byMs: number): number;
}
