import type { Cue } from '../subtitles/cue';
import { SubtitleTrack } from '../subtitles/subtitle-track';
import { findCachedTranslations, saveTranslations } from './cache-client';
import type { LanguagePair, Translation } from './translation-cache';
import type { Translator } from './translator-api';

const BATCH_SIZE = 20;

export type TrackTranslationOptions = {
  playheadMs: () => number;
  onUpdate: (translated: SubtitleTrack) => void;
  signal: AbortSignal;
};

export class CueTranslator {
  private readonly known = new Map<string, string>();

  constructor(
    private readonly translator: Translator,
    private readonly pair: LanguagePair,
  ) {}

  async translateTrack(
    sentences: readonly Cue[],
    { playheadMs, onUpdate, signal }: TrackTranslationOptions,
  ): Promise<void> {
    const translated = new Map<number, Cue>();
    const keep = (sentence: Cue, text: string) => {
      translated.set(sentence.id, { ...sentence, text, lang: this.pair.targetLanguage });
    };
    const publish = () => {
      onUpdate(new SubtitleTrack([...translated.values()]));
    };

    const stopped = () => signal.aborted;
    const texts = [...new Set(sentences.map((sentence) => sentence.text))];
    const cached = await findCachedTranslations(this.pair, texts);
    if (stopped()) return;
    texts.forEach((text, index) => {
      const translation = cached[index];
      if (translation != null) this.known.set(text, translation);
    });
    for (const sentence of sentences) {
      const translation = this.known.get(sentence.text);
      if (translation !== undefined) keep(sentence, translation);
    }
    if (translated.size > 0) publish();

    let remaining = sentences.filter((sentence) => !translated.has(sentence.id));
    while (remaining.length > 0 && !stopped()) {
      const fresh: Translation[] = [];
      for (const sentence of nextBatch(remaining, playheadMs())) {
        if (stopped()) break;
        let translation = this.known.get(sentence.text) ?? null;
        if (translation === null) {
          translation = await this.translateOrAbort(sentence.text, signal);
          if (translation === null) break;
          this.known.set(sentence.text, translation);
          fresh.push({ text: sentence.text, translation });
        }
        keep(sentence, translation);
      }
      if (!stopped()) {
        remaining = remaining.filter((sentence) => !translated.has(sentence.id));
        publish();
      }
      await saveTranslations(this.pair, fresh);
    }
  }

  async translateLine(text: string, signal: AbortSignal): Promise<string | null> {
    const known = this.known.get(text);
    if (known !== undefined) return known;
    const translation = await this.translateOrAbort(text, signal);
    if (translation !== null) this.known.set(text, translation);
    return translation;
  }

  private async translateOrAbort(text: string, signal: AbortSignal): Promise<string | null> {
    try {
      return await this.translator.translate(text, { signal });
    } catch (error) {
      if (signal.aborted) return null;
      throw error;
    }
  }
}

function nextBatch(remaining: readonly Cue[], playheadMs: number): Cue[] {
  const ahead = remaining.filter((sentence) => sentence.endMs > playheadMs);
  const behind = remaining.filter((sentence) => sentence.endMs <= playheadMs).reverse();
  return [...ahead, ...behind].slice(0, BATCH_SIZE);
}
