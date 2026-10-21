import type { PlayerAdapter, PlayerEvents } from '../session/player-adapter';
import { watchNativeControls } from './native-controls';
import type { CaptionStatus } from '../subtitles/caption-status';
import type { Cue } from '../subtitles/cue';
import { isEnglish, isPortuguese } from '../subtitles/language';
import { SubtitleTrack } from '../subtitles/subtitle-track';
import { toPlainText } from '../subtitles/webvtt';

type NativeCue = { readonly startTime: number; readonly endTime: number; readonly text?: string };
type NativeTrack = {
  readonly kind: string;
  readonly language: string;
  readonly label: string;
  mode: TextTrackMode;
  readonly cues: ArrayLike<NativeCue> | null;
};
type ReadTrack = { source: NativeTrack; cueCount: number; track: SubtitleTrack };
type TrackChoice = { tracks: NativeTrack[]; english: NativeTrack | null };

const NO_CUES: readonly Cue[] = Object.freeze([]);
const SUBTITLE_KINDS = new Set(['subtitles', 'captions']);
const TRACK_ERROR = 3;
const ENGLISH_LABEL = /^english\b/i;
const PORTUGUESE_LABEL = /^portugu(?:ese|ês)\b/i;

export class NativeTrackAdapter implements PlayerAdapter {
  private readonly listeners = new AbortController();
  private readonly siteModes = new Map<NativeTrack, TextTrackMode>();
  private chosenEnglish: NativeTrack | null = null;
  private english: ReadTrack | null = null;
  private portuguese: ReadTrack | null = null;
  private stopControls: () => void = () => undefined;

  constructor(private readonly media: HTMLVideoElement) {}

  get player(): Element {
    return this.media;
  }

  start(events: PlayerEvents): void {
    this.media.addEventListener('load', events.onCaptionsChange, {
      capture: true,
      signal: this.listeners.signal,
    });
    this.stopControls = watchNativeControls(this.media, events.onControlsLift);
  }

  stop(): void {
    this.listeners.abort();
    this.stopControls();
    for (const [track, mode] of this.siteModes) track.mode = mode;
    this.siteModes.clear();
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
    return false;
  }

  hideSiteCaptions(): void {
    this.refresh();
  }

  status(): CaptionStatus {
    const { tracks, english } = this.refresh();
    if (!english) return tracks.length > 0 ? 'other-language' : 'waiting';
    if (this.english) return 'full-track';
    return this.failedToLoad(english) ? 'unreadable' : 'waiting';
  }

  englishTrack(): SubtitleTrack | null {
    this.refresh();
    return this.english?.track ?? null;
  }

  officialPortugueseTrack(): SubtitleTrack | null {
    this.refresh();
    return this.portuguese?.track ?? null;
  }

  activeCues(timeMs: number): readonly Cue[] {
    return this.englishTrack()?.activeAt(timeMs) ?? NO_CUES;
  }

  private refresh(): TrackChoice {
    const tracks: NativeTrack[] = Array.from(this.media.textTracks).filter((track) =>
      SUBTITLE_KINDS.has(track.kind),
    );
    const englishTracks = tracks.filter(isEnglishTrack);
    const english =
      englishTracks.find((track) => track.mode === 'showing') ??
      englishTracks.find((track) => track === this.chosenEnglish) ??
      englishTracks[0] ??
      null;
    const portuguese = english ? (tracks.find(isPortugueseTrack) ?? null) : null;
    this.chosenEnglish = english;

    for (const track of english ? tracks : []) {
      if (track === english || track === portuguese) {
        this.setMode(track, 'hidden');
      } else if (track.mode === 'showing') {
        this.setMode(track, 'disabled');
      }
    }
    this.english = readTrack(english, 'en', this.english);
    this.portuguese = readTrack(portuguese, 'pt', this.portuguese);
    return { tracks, english };
  }

  private setMode(track: NativeTrack, mode: TextTrackMode): void {
    if (track.mode === mode) return;
    if (!this.siteModes.has(track)) this.siteModes.set(track, track.mode);
    track.mode = mode;
  }

  private failedToLoad(track: NativeTrack): boolean {
    return Array.from(this.media.querySelectorAll('track')).some(
      (element) => element.track === track && element.readyState === TRACK_ERROR,
    );
  }
}

function isEnglishTrack(track: NativeTrack): boolean {
  return track.language ? isEnglish(track.language.toLowerCase()) : ENGLISH_LABEL.test(track.label);
}

function isPortugueseTrack(track: NativeTrack): boolean {
  return track.language
    ? isPortuguese(track.language.toLowerCase())
    : PORTUGUESE_LABEL.test(track.label);
}

function readTrack(
  source: NativeTrack | null,
  fallbackLang: string,
  previous: ReadTrack | null,
): ReadTrack | null {
  const cues = source?.cues;
  if (!source || !cues || cues.length === 0) return null;
  if (previous?.source === source && previous.cueCount === cues.length) return previous;

  const lang = source.language || fallbackLang;
  const textCues = Array.from(cues).filter((cue) => typeof cue.text === 'string');
  const track = new SubtitleTrack(
    textCues.map((cue, id) => ({
      id,
      startMs: Math.round(cue.startTime * 1000),
      endMs: Math.round(cue.endTime * 1000),
      text: toPlainText(cue.text ?? ''),
      lang,
    })),
  );
  return { source, cueCount: cues.length, track };
}
