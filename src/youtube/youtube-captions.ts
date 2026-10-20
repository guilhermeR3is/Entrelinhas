import { logger } from '../logger';
import type { CaptionStatus } from '../subtitles/caption-status';
import { type Cue, SubtitleFormatError } from '../subtitles/cue';
import { isEnglish, isPortuguese } from '../subtitles/language';
import { SubtitleTrack } from '../subtitles/subtitle-track';
import { parseYouTubeJson3 } from '../subtitles/youtube-json3';
import { readCaptionTrackMessage } from './caption-track-message';

type CaptionPage = Pick<Window, 'location'>;
type CapturedTrack = { videoId: string; lang: string; track: SubtitleTrack | null };
type CapturedLanguage = { videoId: string; lang: string };
type ScreenLine = { videoId: string; cues: readonly Cue[] };

const NO_CUES: readonly Cue[] = Object.freeze([]);
const UNKNOWN_LANGUAGE = 'und';

export class YouTubeCaptions {
  private english: CapturedTrack | null = null;
  private portuguese: CapturedTrack | null = null;
  private latest: CapturedLanguage | null = null;
  private screenLine: ScreenLine | null = null;
  private screenCueId = 0;

  constructor(private readonly page: CaptionPage) {}

  receive(event: Pick<MessageEvent, 'source' | 'data'>): void {
    if (event.source !== this.page) return;
    const message = readCaptionTrackMessage(event.data);
    if (!message) return;

    const { videoId } = message;
    const lang = message.translatedTo ?? message.lang ?? UNKNOWN_LANGUAGE;
    if (isEnglish(lang)) {
      this.english = { videoId, lang, track: readTrack(message.body, lang) };
    } else if (isPortuguese(lang) && message.translatedTo === null && message.kind !== 'asr') {
      this.portuguese = { videoId, lang, track: readTrack(message.body, lang) };
    }
    this.latest = { videoId, lang };
  }

  showScreenText(text: string): void {
    const videoId = this.currentVideoId();
    if (!videoId) return;
    const cue = {
      id: this.screenCueId++,
      startMs: 0,
      endMs: Infinity,
      text,
      lang: UNKNOWN_LANGUAGE,
    };
    this.screenLine = { videoId, cues: text === '' ? NO_CUES : Object.freeze([cue]) };
  }

  status(): CaptionStatus {
    const videoId = this.currentVideoId();
    const english = this.english?.videoId === videoId ? this.english : null;
    if (english?.track) return 'full-track';
    const latest = this.latest?.videoId === videoId ? this.latest : null;
    if (latest && !isEnglish(latest.lang)) return 'other-language';
    if (this.screenLine?.videoId === videoId && this.screenLine.cues.length > 0) return 'screen';
    return english ? 'unreadable' : 'waiting';
  }

  englishTrack(): SubtitleTrack | null {
    return this.trackFor(this.english);
  }

  officialPortugueseTrack(): SubtitleTrack | null {
    return this.trackFor(this.portuguese);
  }

  activeCues(timeMs: number): readonly Cue[] {
    switch (this.status()) {
      case 'full-track':
        return this.englishTrack()?.activeAt(timeMs) ?? NO_CUES;
      case 'screen':
        return this.screenLine?.cues ?? NO_CUES;
      default:
        return NO_CUES;
    }
  }

  currentVideoId(): string | null {
    const url = new URL(this.page.location.href);
    return url.pathname === '/watch' ? url.searchParams.get('v') : null;
  }

  private trackFor(captured: CapturedTrack | null): SubtitleTrack | null {
    return captured?.videoId === this.currentVideoId() ? captured.track : null;
  }
}

function readTrack(body: string, lang: string): SubtitleTrack | null {
  try {
    return new SubtitleTrack(parseYouTubeJson3(body, lang));
  } catch (error) {
    if (!(error instanceof SubtitleFormatError)) throw error;
    logger.error('Could not read the YouTube caption track', error);
    return null;
  }
}
