import type { Cue } from '../subtitles/cue';

export type OverlayNotice = 'captions-off' | 'other-language' | 'unreadable';

const NOTICE_MS = 5000;
const NOTICE_FADE_MS = 160;
const NO_CUES: readonly Cue[] = Object.freeze([]);

const NOTICES: Record<OverlayNotice, { wordClass: string; definition: string }> = {
  'captions-off': { wordClass: 'desligada', definition: 'Ligue a legenda (CC) em inglês.' },
  'other-language': { wordClass: 'outro idioma', definition: 'Escolha inglês na legenda (CC).' },
  unreadable: { wordClass: 'indisponível', definition: 'Não deu para ler a legenda deste vídeo.' },
};

export class SubtitleOverlay {
  private readonly document: Document;
  private readonly frame: HTMLElement;
  private readonly subtitle: HTMLElement;
  private readonly english: HTMLElement;
  private readonly portuguese: HTMLElement;
  private readonly status: HTMLElement;
  private shownEnglish = NO_CUES;
  private shownPortuguese = NO_CUES;
  private noticeTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(container: Element) {
    this.document = container.ownerDocument;
    this.english = this.element('p', 'english');
    this.english.lang = 'en';
    this.portuguese = this.element('p', 'portuguese');
    this.portuguese.lang = 'pt-BR';
    this.subtitle = this.element('div', 'subtitle', this.english, this.portuguese);
    this.subtitle.hidden = true;
    this.status = this.element('div', 'status');
    this.status.setAttribute('role', 'status');
    this.frame = this.element('div', 'frame', this.subtitle, this.status);
    container.append(this.frame);
  }

  setControlsLift(liftPx: number): void {
    this.frame.style.setProperty('--controls-lift', `${String(liftPx)}px`);
  }

  showCues(english: readonly Cue[], portuguese: readonly Cue[] = NO_CUES): void {
    if (english === this.shownEnglish && portuguese === this.shownPortuguese) return;
    this.shownEnglish = english;
    this.shownPortuguese = portuguese;

    this.english.textContent = textOf(english);
    this.portuguese.textContent = textOf(portuguese);
    this.portuguese.hidden = portuguese.length === 0;
    this.subtitle.hidden = english.length === 0 && portuguese.length === 0;
    if (!this.subtitle.hidden) this.hideNotice();
  }

  showNotice(notice: OverlayNotice): void {
    const { wordClass, definition } = NOTICES[notice];
    const headword = this.element('strong', 'headword');
    headword.textContent = 'Legenda dupla';
    const wordClassElement = this.element('em', 'word-class');
    wordClassElement.textContent = wordClass;
    const definitionElement = this.element('p', 'definition');
    definitionElement.textContent = definition;

    const entry = this.element('p', 'entry-line', headword, wordClassElement);
    const noticeElement = this.element('div', 'notice', entry, definitionElement);
    this.status.replaceChildren(noticeElement);
    clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => {
      noticeElement.classList.add('leaving');
      this.noticeTimer = setTimeout(() => {
        this.hideNotice();
      }, NOTICE_FADE_MS);
    }, NOTICE_MS);
  }

  hideNotice(): void {
    clearTimeout(this.noticeTimer);
    this.status.replaceChildren();
  }

  private element(tag: string, className: string, ...children: Node[]): HTMLElement {
    const element = this.document.createElement(tag);
    element.className = className;
    element.append(...children);
    return element;
  }
}

function textOf(cues: readonly Cue[]): string {
  return cues.map((cue) => cue.text).join('\n');
}
