import { logger } from '../logger';
import type { SubtitleOverlay, WordPick } from '../overlay/subtitle-overlay';
import type { WordMeaning } from '../overlay/word-card';
import type { PortugueseTranslation } from '../translation/portuguese-translation';
import { videoLinkAt } from '../vocabulary/video-moment';
import { findWord, removeWord, saveWord } from '../vocabulary/vocabulary-client';
import type { NewWord } from '../vocabulary/vocabulary-store';

type WordOverlay = Pick<
  SubtitleOverlay,
  'listenForWords' | 'openWordCard' | 'closeWordCard' | 'holds' | 'wordCard'
>;
type WordTranslation = Pick<PortugueseTranslation, 'pageStatus' | 'translateText'>;

interface OpenWord {
  pick: WordPick;
  timeMs: number;
  video: HTMLVideoElement | null;
  pausedHere: boolean;
  translation: string | null;
  saved: boolean;
  busy: boolean;
  stop: AbortController;
}

const MAX_SENTENCE = 1000;
const MAX_TRANSLATION = 500;

export function videoTitle(document: Document): string {
  const title = document.title
    .replace(/^\(\d+\)\s*/, '')
    .replace(/\s+-\s+YouTube$/, '')
    .trim();
  return (title || document.location.hostname).slice(0, 500);
}

export class WordStudy {
  private open: OpenWord | null = null;

  constructor(
    private readonly overlay: WordOverlay,
    private readonly video: () => HTMLVideoElement | null,
    private readonly translation: WordTranslation,
    private readonly document: Document,
    signal: AbortSignal,
  ) {
    overlay.listenForWords({
      onPick: (pick) => {
        this.show(pick);
      },
      onSave: () => {
        void this.toggleSaved();
      },
      onClose: () => {
        this.close(true);
      },
    });
    document.addEventListener(
      'pointerdown',
      (event) => {
        if (this.open && !overlay.holds(event)) this.close(true);
      },
      { capture: true, signal },
    );
    document.addEventListener(
      'keydown',
      (event) => {
        if (!this.open || event.key !== 'Escape') return;
        event.preventDefault();
        event.stopImmediatePropagation();
        this.close(true);
      },
      { capture: true, signal },
    );
    signal.addEventListener('abort', () => {
      this.close(false);
    });
  }

  close(resume: boolean): void {
    const open = this.open;
    if (!open) return;
    this.open = null;
    open.stop.abort();
    this.overlay.closeWordCard();
    if (resume && open.pausedHere && open.video?.paused) {
      open.video.play().catch((error: unknown) => {
        logger.error('Could not resume the video after the word card', error);
      });
    }
  }

  private show(pick: WordPick): void {
    const previous = this.open;
    previous?.stop.abort();
    const video = this.video();
    const playing = !!video && !video.paused;
    if (playing) video.pause();
    const open: OpenWord = {
      pick,
      timeMs: Math.round((video?.currentTime ?? 0) * 1000),
      video,
      pausedHere: playing || (previous?.pausedHere ?? false),
      translation: null,
      saved: false,
      busy: false,
      stop: new AbortController(),
    };
    this.open = open;
    video?.addEventListener(
      'play',
      () => {
        this.close(false);
      },
      { once: true, signal: open.stop.signal },
    );
    const wordClass = pick.uncommon === null ? null : pick.uncommon ? 'pouco comum' : 'comum';
    this.overlay.openWordCard(pick.token.text, wordClass);
    void this.translate(open);
    void this.findSaved(open);
  }

  private async translate(open: OpenWord): Promise<void> {
    const status = this.translation.pageStatus();
    if (status !== 'ready') {
      this.showMeaning(open, { kind: status === 'preparing' ? 'not-ready' : status });
      return;
    }
    try {
      const text = await this.translation.translateText(open.pick.token.key, open.stop.signal);
      if (text === null) return;
      open.translation = text.slice(0, MAX_TRANSLATION);
      this.showMeaning(open, { kind: 'translated', text });
    } catch (error) {
      logger.error('Could not translate the picked word', error);
      this.showMeaning(open, { kind: 'failed' });
    }
  }

  private async findSaved(open: OpenWord): Promise<void> {
    try {
      const saved = await findWord(open.pick.token.key);
      if (this.open !== open || open.busy) return;
      open.saved = saved !== null;
      this.overlay.wordCard.setSaving(open.saved, 'idle');
    } catch (error) {
      logger.error('Could not check whether the word was saved', error);
    }
  }

  private async toggleSaved(): Promise<void> {
    const open = this.open;
    if (!open || open.busy) return;
    open.busy = true;
    this.overlay.wordCard.setSaving(open.saved, 'busy');
    try {
      if (open.saved) await removeWord(open.pick.token.key);
      else await saveWord(this.entryFor(open));
      open.saved = !open.saved;
      open.busy = false;
      if (this.open === open) this.overlay.wordCard.setSaving(open.saved, 'idle');
    } catch (error) {
      logger.error('Could not change the saved word', error);
      open.busy = false;
      if (this.open === open) this.overlay.wordCard.setSaving(open.saved, 'failed');
    }
  }

  private entryFor(open: OpenWord): NewWord {
    const { token, sentence, portuguese } = open.pick;
    return {
      word: token.key.slice(0, 100),
      shown: token.text.slice(0, 100),
      translation: open.translation,
      sentence: sentence.slice(0, MAX_SENTENCE),
      sentenceTranslation: portuguese?.slice(0, MAX_SENTENCE) ?? null,
      videoTitle: videoTitle(this.document),
      videoUrl: videoLinkAt(this.document.location.href, open.timeMs).slice(0, 2000),
      timeMs: open.timeMs,
    };
  }

  private showMeaning(open: OpenWord, meaning: WordMeaning): void {
    if (this.open === open) this.overlay.wordCard.setMeaning(meaning);
  }
}
