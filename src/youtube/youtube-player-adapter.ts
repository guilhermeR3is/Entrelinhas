import type { PlayerAdapter, PlayerEvents } from '../session/player-adapter';
import type { CaptionStatus } from '../subtitles/caption-status';
import type { Cue } from '../subtitles/cue';
import type { SubtitleTrack } from '../subtitles/subtitle-track';
import { observeScreenCaptions } from './caption-observer';
import { watchPlayerControls } from './player-controls';
import { watchSpeedIntent } from './speed-intent';
import type { YouTubeCaptions } from './youtube-captions';

const AD_CLASS = 'ad-showing';
const SITE_CAPTIONS_SELECTOR = '#ytp-caption-window-container';

export class YouTubePlayerAdapter implements PlayerAdapter {
  private readonly listeners = new AbortController();
  private controlsObserver: MutationObserver | undefined;
  private speedIntent: () => boolean = () => false;
  private siteCaptions: HTMLElement | null = null;
  private screenObserver: MutationObserver | undefined;
  private onCaptionsChange: () => void = () => undefined;
  private onFailure: (error: unknown) => void = () => undefined;

  constructor(
    readonly player: Element,
    private readonly captions: YouTubeCaptions,
  ) {}

  start(events: PlayerEvents): void {
    this.onCaptionsChange = events.onCaptionsChange;
    this.onFailure = events.onFailure;
    this.controlsObserver = watchPlayerControls(this.player, events.onControlsLift);
    const page = this.player.ownerDocument.defaultView;
    if (page) this.speedIntent = watchSpeedIntent(page, this.listeners.signal);
  }

  stop(): void {
    this.listeners.abort();
    this.controlsObserver?.disconnect();
    this.screenObserver?.disconnect();
    this.siteCaptions?.style.removeProperty('visibility');
  }

  video(): HTMLVideoElement | null {
    return this.player.querySelector('video');
  }

  videoKey(): string | null {
    return this.captions.currentVideoId();
  }

  isShowingAd(): boolean {
    return this.player.classList.contains(AD_CLASS);
  }

  personChangedSpeed(): boolean {
    return this.speedIntent();
  }

  status(): CaptionStatus {
    return this.captions.status();
  }

  activeCues(timeMs: number): readonly Cue[] {
    return this.captions.activeCues(timeMs);
  }

  englishTrack(): SubtitleTrack | null {
    return this.captions.englishTrack();
  }

  officialPortugueseTrack(): SubtitleTrack | null {
    return this.captions.officialPortugueseTrack();
  }

  hideSiteCaptions(hidden: boolean): void {
    const siteCaptions = this.followSiteCaptions();
    if (hidden) siteCaptions?.style.setProperty('visibility', 'hidden');
    else siteCaptions?.style.removeProperty('visibility');
  }

  private followSiteCaptions(): HTMLElement | null {
    const siteCaptions = this.player.querySelector<HTMLElement>(SITE_CAPTIONS_SELECTOR);
    if (siteCaptions === this.siteCaptions) return siteCaptions;

    this.screenObserver?.disconnect();
    this.siteCaptions?.style.removeProperty('visibility');
    this.siteCaptions = siteCaptions;
    this.screenObserver = siteCaptions
      ? observeScreenCaptions(siteCaptions, (text) => {
          try {
            this.captions.showScreenText(text);
            this.onCaptionsChange();
          } catch (error) {
            this.onFailure(error);
          }
        })
      : undefined;
    return siteCaptions;
  }
}
