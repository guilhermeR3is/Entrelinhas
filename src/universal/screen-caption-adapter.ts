import type { PlayerAdapter, PlayerEvents } from '../session/player-adapter';
import type { CaptionStatus } from '../subtitles/caption-status';
import type { Cue } from '../subtitles/cue';

const NO_CUES: readonly Cue[] = Object.freeze([]);
const SCREEN_LANGUAGE = 'en';

export class ScreenCaptionAdapter implements PlayerAdapter {
  private readonly observer = new MutationObserver(() => {
    this.readScreen();
  });
  private readonly hidden = new Set<HTMLElement>();
  private scope: Node;
  private shownText = '';
  private cues: readonly Cue[] = NO_CUES;
  private seenCaption = false;
  private nextCueId = 0;
  private onCaptionsChange: () => void = () => undefined;

  constructor(
    private readonly media: HTMLVideoElement,
    private readonly selector: string,
  ) {
    this.scope = media.ownerDocument.body;
  }

  get player(): Element {
    return this.media;
  }

  start(events: PlayerEvents): void {
    this.onCaptionsChange = events.onCaptionsChange;
    this.observe(this.scope);
    this.readScreen();
  }

  stop(): void {
    this.observer.disconnect();
    for (const element of this.hidden) element.style.removeProperty('visibility');
    this.hidden.clear();
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

  status(): CaptionStatus {
    return this.seenCaption ? 'screen' : 'waiting';
  }

  activeCues(): readonly Cue[] {
    return this.cues;
  }

  englishTrack(): null {
    return null;
  }

  officialPortugueseTrack(): null {
    return null;
  }

  hideSiteCaptions(hidden: boolean): void {
    for (const element of this.hidden) {
      if (!element.isConnected) this.hidden.delete(element);
    }
    for (const element of this.captionElements()) {
      if (hidden) {
        element.style.setProperty('visibility', 'hidden');
        this.hidden.add(element);
      } else {
        element.style.removeProperty('visibility');
        this.hidden.delete(element);
      }
    }
  }

  private captionElements(): HTMLElement[] {
    return Array.from(this.media.ownerDocument.querySelectorAll<HTMLElement>(this.selector));
  }

  private readScreen(): void {
    const elements = this.captionElements();
    const [first] = elements;
    if (first && this.scope === this.media.ownerDocument.body) this.narrowScope(first);

    const text = elements
      .map((element) => element.textContent.trim())
      .filter((line) => line !== '')
      .join('\n');
    if (text === this.shownText) return;
    this.shownText = text;
    if (text !== '') this.seenCaption = true;
    this.cues =
      text === ''
        ? NO_CUES
        : Object.freeze([
            { id: this.nextCueId++, startMs: 0, endMs: Infinity, text, lang: SCREEN_LANGUAGE },
          ]);
    this.onCaptionsChange();
  }

  private narrowScope(caption: Element): void {
    let player: Node | null = this.media.parentNode;
    while (player && !player.contains(caption)) player = player.parentNode;
    if (!player || player === this.scope) return;
    this.scope = player;
    this.observe(player);
  }

  private observe(target: Node): void {
    this.observer.disconnect();
    this.observer.observe(target, { childList: true, subtree: true, characterData: true });
  }
}
