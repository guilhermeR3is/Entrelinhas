import { logger } from '../logger';
import type { TranslationState } from '../overlay/subtitle-overlay';
import type { Cue } from '../subtitles/cue';
import type { SubtitleTrack } from '../subtitles/subtitle-track';
import { CueTranslator } from './cue-translator';
import { groupSentences } from './sentence-groups';
import type { TranslatorApi } from './translator-api';
import { prepareTranslator, type TranslatorStatus } from './translator-setup';

const ENGLISH_TO_PORTUGUESE = { sourceLanguage: 'en', targetLanguage: 'pt' };
const NO_CUES: readonly Cue[] = Object.freeze([]);

type TrackJob = { english: SubtitleTrack; portuguese: SubtitleTrack | null; stop: AbortController };
type LineJob = { english: string; portuguese: readonly Cue[]; stop: AbortController };

export class PortugueseTranslation {
  private cueTranslator: CueTranslator | null = null;
  private translationState: TranslationState | null = null;
  private trackJob: TrackJob | null = null;
  private lineJob: LineJob | null = null;
  private playheadMs = 0;

  constructor(private readonly onChange: () => void) {}

  async prepare(api: TranslatorApi | null, page: EventTarget, signal: AbortSignal): Promise<void> {
    const translator = await prepareTranslator(
      api,
      ENGLISH_TO_PORTUGUESE,
      page,
      (status) => {
        this.translationState = stateFor(status);
        this.onChange();
      },
      signal,
    );
    if (!translator) return;
    this.cueTranslator = new CueTranslator(translator, ENGLISH_TO_PORTUGUESE);
    this.onChange();
  }

  state(): TranslationState | null {
    return this.translationState;
  }

  cuesFor(english: SubtitleTrack, timeMs: number): readonly Cue[] {
    this.playheadMs = timeMs;
    if (this.trackJob?.english !== english) this.startTrack(english);
    return this.trackJob?.portuguese?.activeAt(timeMs) ?? NO_CUES;
  }

  lineFor(english: string): readonly Cue[] {
    if (this.lineJob?.english !== english) this.startLine(english);
    return this.lineJob?.portuguese ?? NO_CUES;
  }

  private startTrack(english: SubtitleTrack): void {
    const cueTranslator = this.cueTranslator;
    if (!cueTranslator) return;
    this.trackJob?.stop.abort();
    const job: TrackJob = { english, portuguese: null, stop: new AbortController() };
    this.trackJob = job;
    if (this.translationState?.kind === 'translation-failed') this.translationState = null;

    cueTranslator
      .translateTrack(groupSentences(english.cues), {
        playheadMs: () => this.playheadMs,
        onUpdate: (portuguese) => {
          job.portuguese = portuguese;
          this.onChange();
        },
        signal: job.stop.signal,
      })
      .catch((error: unknown) => {
        if (job.stop.signal.aborted) return;
        logger.error('Could not translate the caption track', error);
        this.translationState = { kind: 'translation-failed' };
        this.onChange();
      });
  }

  private startLine(english: string): void {
    const cueTranslator = this.cueTranslator;
    if (!cueTranslator) return;
    this.lineJob?.stop.abort();
    const job: LineJob = { english, portuguese: NO_CUES, stop: new AbortController() };
    this.lineJob = job;
    if (english === '') return;

    cueTranslator
      .translateLine(english, job.stop.signal)
      .then((portuguese) => {
        if (portuguese === null) return;
        job.portuguese = Object.freeze([
          { id: 0, startMs: 0, endMs: Infinity, text: portuguese, lang: 'pt' },
        ]);
        this.onChange();
      })
      .catch((error: unknown) => {
        logger.error('Could not translate the caption line', error);
        this.translationState = { kind: 'translation-failed' };
        this.onChange();
      });
  }
}

function stateFor(status: TranslatorStatus): TranslationState | null {
  switch (status.kind) {
    case 'ready':
      return null;
    case 'failed':
      return { kind: 'download-failed' };
    default:
      return status;
  }
}
