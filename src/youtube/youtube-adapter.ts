import { logger } from '../logger';
import { type Cue, SubtitleFormatError } from '../subtitles/cue';
import { SubtitleTrack } from '../subtitles/subtitle-track';
import { parseYouTubeJson3 } from '../subtitles/youtube-json3';
import { readCaptionTrackMessage } from './caption-track-message';

export type CaptionStatus = 'waiting' | 'full-track' | 'screen' | 'other-language' | 'unreadable';

type CaptionPage = Pick<Window, 'location'>;
type CapturedTrack = { videoId: string; lang: string; track: SubtitleTrack | null };
type ScreenLine = { videoId: string; cues: readonly Cue[] };

const NO_CUES: readonly Cue[] = Object.freeze([]);
const UNKNOWN_LANGUAGE = 'und';

export class YouTubeAdapter {
  private captured: CapturedTrack | null = null;
  private screenLine: ScreenLine | null = null;
  private screenCueId = 0;

  constructor(private readonly page: CaptionPage) {}

  receive(event: Pick<MessageEvent, 'source' | 'data'>): void {
    if (event.source !== this.page) return;
    const message = readCaptionTrackMessage(event.data);
    if (!message) return;

    const lang = message.translatedTo ?? message.lang ?? UNKNOWN_LANGUAGE;
    const track = isEnglish(lang) ? readTrack(message.body, lang) : null;
    this.captured = { videoId: message.videoId, lang, track };
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
    const captured = this.captured?.videoId === videoId ? this.captured : null;
    if (captured?.track) return 'full-track';
    if (captured && !isEnglish(captured.lang)) return 'other-language';
    if (this.screenLine?.videoId === videoId && this.screenLine.cues.length > 0) return 'screen';
    return captured ? 'unreadable' : 'waiting';
  }

  activeCues(timeMs: number): readonly Cue[] {
    switch (this.status()) {
      case 'full-track':
        return this.captured?.track?.activeAt(timeMs) ?? NO_CUES;
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
}

function isEnglish(lang: string): boolean {
  return lang === 'en' || lang.startsWith('en-');
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
