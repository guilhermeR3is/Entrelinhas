import {
  type OverlayNotice,
  SubtitleOverlay,
  type TranslationState,
} from '../overlay/subtitle-overlay';
import { StudyControls } from '../study/study-controls';
import type { StudyCommand, StudyKeys } from '../study/study-keys';
import type { StudyPreferenceStore } from '../study/study-preferences';
import type { Cue } from '../subtitles/cue';
import type { PortugueseTranslation } from '../translation/portuguese-translation';
import { observeScreenCaptions } from './caption-observer';
import { watchPlayerControls } from './player-controls';
import { watchSpeedIntent } from './speed-intent';
import type { CaptionStatus, YouTubeAdapter } from './youtube-adapter';

const NOTICE_DELAY_S = 2;
const AD_CLASS = 'ad-showing';
const NATIVE_CAPTIONS_SELECTOR = '#ytp-caption-window-container';
const NO_CUES: readonly Cue[] = Object.freeze([]);
const STUDY_STATUSES = new Set<CaptionStatus>(['full-track', 'screen']);
const NOTICES: Partial<Record<CaptionStatus, OverlayNotice>> = {
  waiting: 'captions-off',
  'other-language': 'other-language',
  unreadable: 'unreadable',
};

type PendingNotice = { key: string; notice: OverlayNotice; sinceS: number };

export class SubtitleSession {
  private readonly overlay: SubtitleOverlay;
  private readonly listeners = new AbortController();
  private readonly controlsObserver: MutationObserver;
  private readonly personChangedSpeed: () => boolean;
  private controls: StudyControls | undefined;
  private controlsVideo: HTMLVideoElement | null = null;
  private shownEnglish: readonly Cue[] = NO_CUES;
  private nativeCaptions: HTMLElement | null = null;
  private screenObserver: MutationObserver | undefined;
  private frame = 0;
  private pendingNotice: PendingNotice | null = null;
  private shownNoticeKey: string | null = null;
  private shownTranslationState: TranslationState | null = null;

  constructor(
    container: Element,
    private readonly player: Element,
    private readonly adapter: YouTubeAdapter,
    private readonly translation: PortugueseTranslation,
    private readonly preferences: StudyPreferenceStore,
  ) {
    this.overlay = new SubtitleOverlay(
      container,
      (command) => {
        this.handleCommand(command);
      },
      preferences.current.placement,
      (placement) => {
        preferences.remember({ placement });
      },
    );
    this.overlay.setKeys(preferences.current.keys);
    this.controlsObserver = watchPlayerControls(player, (liftPx) => {
      this.overlay.setControlsLift(liftPx);
    });

    const page = player.ownerDocument.defaultView;
    this.personChangedSpeed = page ? watchSpeedIntent(page, this.listeners.signal) : () => false;

    const options = { capture: true, signal: this.listeners.signal };
    player.addEventListener('playing', this.play, options);
    for (const type of ['pause', 'seeked', 'emptied']) {
      player.addEventListener(type, this.render, options);
    }
    this.play();
  }

  readonly render = (): void => {
    const video = this.player.querySelector('video');
    const timeS = video?.currentTime ?? 0;
    const nativeCaptions = this.followNativeCaptions();
    const isAd = this.player.classList.contains(AD_CLASS);
    const controls = this.followControls(video);
    controls?.setHeld(isAd);
    if (isAd) {
      this.overlay.setStudyState(false, false);
      this.overlay.showCues(NO_CUES);
      this.overlay.hideNotice();
      nativeCaptions?.style.removeProperty('visibility');
      this.pendingNotice = null;
      return;
    }

    const status = this.adapter.status();
    this.overlay.setStudyState(STUDY_STATUSES.has(status), video?.paused ?? true);
    const englishTrack = status === 'full-track' ? this.adapter.englishTrack() : null;
    const playheadMs = Math.round(timeS * 1000);
    if (englishTrack) controls?.followSentences(englishTrack, playheadMs);
    const timeMs = controls?.displayTimeMs(playheadMs) ?? playheadMs;
    let english = this.adapter.activeCues(timeMs);
    if (status === 'screen') {
      controls?.followLine(english.map((cue) => cue.text).join('\n'), playheadMs);
      if (controls?.isFrozen) english = this.shownEnglish;
    }
    this.shownEnglish = english;
    const official = status === 'full-track' ? this.adapter.officialPortugueseTrack() : null;
    const portuguese = official
      ? official.activeAt(timeMs)
      : this.translatedCues(status, english, timeMs);
    this.overlay.showCues(english, english.length > 0 ? portuguese : NO_CUES);
    if (english.length > 0) this.followTranslationState(official ? null : this.translation.state());
    if (status === 'full-track' || status === 'screen') {
      nativeCaptions?.style.setProperty('visibility', 'hidden');
    } else {
      nativeCaptions?.style.removeProperty('visibility');
    }
    if (video && !video.paused) this.updateNotice(status, timeS);
  };

  setKeys(keys: StudyKeys): void {
    this.overlay.setKeys(keys);
  }

  handleCommand(command: StudyCommand): boolean {
    if (!this.controls || this.player.classList.contains(AD_CLASS)) return false;
    this.controls.handle(command);
    return true;
  }

  stop(): void {
    this.listeners.abort();
    this.controls?.stop();
    cancelAnimationFrame(this.frame);
    this.screenObserver?.disconnect();
    this.controlsObserver.disconnect();
    this.nativeCaptions?.style.removeProperty('visibility');
    this.overlay.hideNotice();
  }

  private translatedCues(
    status: CaptionStatus,
    english: readonly Cue[],
    timeMs: number,
  ): readonly Cue[] {
    if (status === 'screen')
      return this.translation.lineFor(english.map((cue) => cue.text).join('\n'));
    const englishTrack = status === 'full-track' ? this.adapter.englishTrack() : null;
    return englishTrack ? this.translation.cuesFor(englishTrack, timeMs) : NO_CUES;
  }

  private followTranslationState(state: TranslationState | null): void {
    if (state === this.shownTranslationState) return;
    this.shownTranslationState = state;
    this.overlay.showTranslationState(state);
  }

  private followControls(video: HTMLVideoElement | null): StudyControls | undefined {
    if (video === this.controlsVideo) return this.controls;
    this.controls?.stop();
    this.controlsVideo = video;
    this.controls = video
      ? new StudyControls(
          video,
          this.overlay,
          this.personChangedSpeed,
          this.preferences.current,
          (change) => {
            this.preferences.remember(change);
          },
        )
      : undefined;
    return this.controls;
  }

  private followNativeCaptions(): HTMLElement | null {
    const captions = this.player.querySelector<HTMLElement>(NATIVE_CAPTIONS_SELECTOR);
    if (captions === this.nativeCaptions) return captions;

    this.screenObserver?.disconnect();
    this.nativeCaptions?.style.removeProperty('visibility');
    this.nativeCaptions = captions;
    this.screenObserver = captions
      ? observeScreenCaptions(captions, (text) => {
          this.adapter.showScreenText(text);
          this.render();
        })
      : undefined;
    return captions;
  }

  private readonly play = (): void => {
    cancelAnimationFrame(this.frame);
    const tick = () => {
      this.render();
      const video = this.player.querySelector('video');
      if (video && !video.paused && !this.listeners.signal.aborted) {
        this.frame = requestAnimationFrame(tick);
      }
    };
    tick();
  };

  private updateNotice(status: CaptionStatus, timeS: number): void {
    const videoId = this.adapter.currentVideoId();
    const notice = NOTICES[status];
    if (!videoId || !notice) {
      this.pendingNotice = null;
      return;
    }

    const key = `${videoId}:${status}`;
    if (this.pendingNotice?.key !== key) this.pendingNotice = { key, notice, sinceS: timeS };
    const waitedS = Math.abs(timeS - this.pendingNotice.sinceS);
    if (waitedS >= NOTICE_DELAY_S && this.shownNoticeKey !== key) {
      this.shownNoticeKey = key;
      this.overlay.showNotice(notice);
    }
  }
}
