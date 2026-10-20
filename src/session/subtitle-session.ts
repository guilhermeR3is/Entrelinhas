import type { DelayCommand } from '../overlay/study-strip';
import {
  type OverlayNotice,
  SubtitleOverlay,
  type TranslationState,
} from '../overlay/subtitle-overlay';
import { StudyControls } from '../study/study-controls';
import type { StudyCommand, StudyKeys } from '../study/study-keys';
import type { StudyPreferenceStore } from '../study/study-preferences';
import type { CaptionStatus } from '../subtitles/caption-status';
import type { Cue } from '../subtitles/cue';
import type { PortugueseTranslation } from '../translation/portuguese-translation';
import type { PlayerAdapter } from './player-adapter';

const NOTICE_DELAY_S = 2;
const DELAY_STEP_MS = 100;
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
  private controls: StudyControls | undefined;
  private controlsVideo: HTMLVideoElement | null = null;
  private shownEnglish: readonly Cue[] = NO_CUES;
  private frame = 0;
  private pendingNotice: PendingNotice | null = null;
  private shownNoticeKey: string | null = null;
  private shownTranslationState: TranslationState | null = null;

  constructor(
    container: Element,
    private readonly adapter: PlayerAdapter,
    private readonly translation: PortugueseTranslation,
    private readonly preferences: StudyPreferenceStore,
  ) {
    this.overlay = new SubtitleOverlay(
      container,
      (command) => {
        if (command === 'earlier' || command === 'later') this.shiftDelay(command);
        else this.handleCommand(command);
      },
      preferences.current.placement,
      (placement) => {
        preferences.remember({ placement });
      },
    );
    this.overlay.setKeys(preferences.current.keys);
    this.overlay.setCaptionDelay(adapter.shiftDelay ? (adapter.delayMs ?? 0) : null);
    adapter.start({
      onCaptionsChange: this.render,
      onControlsLift: (liftPx) => {
        this.overlay.setControlsLift(liftPx);
      },
    });

    const options = { capture: true, signal: this.listeners.signal };
    adapter.player.addEventListener('playing', this.play, options);
    for (const type of ['pause', 'seeked', 'emptied']) {
      adapter.player.addEventListener(type, this.render, options);
    }
    this.play();
  }

  readonly render = (): void => {
    const video = this.adapter.video();
    const timeS = video?.currentTime ?? 0;
    const isAd = this.adapter.isShowingAd();
    const controls = this.followControls(video);
    controls?.setHeld(isAd);
    if (isAd) {
      this.overlay.setStudyState(false, false);
      this.overlay.showCues(NO_CUES);
      this.overlay.hideNotice();
      this.adapter.hideSiteCaptions(false);
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
    this.overlay.showCues(english, english.length > 0 ? portuguese : NO_CUES, timeMs);
    if (english.length > 0) this.followTranslationState(official ? null : this.translation.state());
    this.adapter.hideSiteCaptions(status === 'full-track' || status === 'screen');
    if (video && !video.paused) this.updateNotice(status, timeS);
  };

  setKeys(keys: StudyKeys): void {
    this.overlay.setKeys(keys);
  }

  handleCommand(command: StudyCommand): boolean {
    if (!this.controls || this.adapter.isShowingAd()) return false;
    this.controls.handle(command);
    return true;
  }

  stop(): void {
    this.listeners.abort();
    this.controls?.stop();
    cancelAnimationFrame(this.frame);
    this.adapter.stop();
    this.overlay.hideNotice();
  }

  private shiftDelay(command: DelayCommand): void {
    if (!this.adapter.shiftDelay) return;
    const delayMs = this.adapter.shiftDelay(command === 'later' ? DELAY_STEP_MS : -DELAY_STEP_MS);
    this.overlay.setCaptionDelay(delayMs);
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
          () => this.adapter.personChangedSpeed(),
          this.preferences.current,
          (change) => {
            this.preferences.remember(change);
          },
        )
      : undefined;
    return this.controls;
  }

  private readonly play = (): void => {
    cancelAnimationFrame(this.frame);
    const tick = () => {
      this.render();
      const video = this.adapter.video();
      if (video && !video.paused && !this.listeners.signal.aborted) {
        this.frame = requestAnimationFrame(tick);
      }
    };
    tick();
  };

  private updateNotice(status: CaptionStatus, timeS: number): void {
    const videoKey = this.adapter.videoKey();
    const notice = NOTICES[status];
    if (!videoKey || !notice) {
      this.pendingNotice = null;
      return;
    }

    const key = `${videoKey}:${status}`;
    if (this.pendingNotice?.key !== key) this.pendingNotice = { key, notice, sinceS: timeS };
    const waitedS = Math.abs(timeS - this.pendingNotice.sinceS);
    if (waitedS >= NOTICE_DELAY_S && this.shownNoticeKey !== key) {
      this.shownNoticeKey = key;
      this.overlay.showNotice(notice);
    }
  }
}
