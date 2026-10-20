import type { StudyCommand } from '../study/study-keys';
import type { Cue } from '../subtitles/cue';
import {
  DEFAULT_PLACEMENT,
  offsetFor,
  placementAt,
  toggledEdge,
  topOf,
  type BoxOffset,
  type BoxPlacement,
  type Size,
} from './box-placement';
import { StudyStrip } from './study-strip';

export type OverlayNotice = 'captions-off' | 'other-language' | 'unreadable';
export type TranslationState =
  | { kind: 'waiting-for-gesture' }
  | { kind: 'downloading'; progress: number }
  | { kind: 'unsupported' }
  | { kind: 'download-failed' }
  | { kind: 'translation-failed' };

const NOTICE_MS = 5000;
const NOTICE_FADE_MS = 160;
const STRIP_FLASH_MS = 1500;
const ISOLATED_EVENTS = [
  'pointerdown',
  'mousedown',
  'click',
  'dblclick',
  'keydown',
  'keyup',
  'keypress',
];
const NO_CUES: readonly Cue[] = Object.freeze([]);
const CONTROLS_GAP_PX = 8;
const DRAG_THRESHOLD_PX = 4;
const KEY_STEP = 0.05;
const ARROW_STEPS: Partial<Record<string, { x: number; y: number }>> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};

interface BoxDrag {
  pointerId: number;
  startX: number;
  startY: number;
  left: number;
  top: number;
  moved: boolean;
}

const NOTICES: Record<OverlayNotice, { wordClass: string; definition: string }> = {
  'captions-off': { wordClass: 'desligada', definition: 'Ligue a legenda (CC) em inglês.' },
  'other-language': { wordClass: 'outro idioma', definition: 'Escolha inglês na legenda (CC).' },
  unreadable: { wordClass: 'indisponível', definition: 'Não deu para ler a legenda deste vídeo.' },
};

const TRANSLATION_STATES: Record<TranslationState['kind'], string> = {
  'waiting-for-gesture': 'Clique na página para ligar o português.',
  downloading: 'Baixando o português…',
  unsupported: 'Este navegador não traduz para o português.',
  'download-failed': 'Não deu para baixar o português. Recarregue a página.',
  'translation-failed': 'Não deu para traduzir este vídeo.',
};
const LASTING_STATES = new Set<TranslationState['kind']>(['waiting-for-gesture', 'downloading']);

export class SubtitleOverlay {
  private readonly document: Document;
  private readonly frame: HTMLElement;
  private readonly box: HTMLElement;
  private readonly strip: StudyStrip;
  private readonly subtitle: HTMLElement;
  private readonly english: HTMLElement;
  private readonly portuguese: HTMLElement;
  private readonly status: HTMLElement;
  private readonly announcer: HTMLElement;
  private shownEnglish = NO_CUES;
  private shownPortuguese = NO_CUES;
  private translationState: TranslationState | null = null;
  private noticeTimer: ReturnType<typeof setTimeout> | undefined;
  private translationStateTimer: ReturnType<typeof setTimeout> | undefined;
  private studyAvailable = false;
  private stripPinned = false;
  private stripFocused = false;
  private stripFlashTimer: ReturnType<typeof setTimeout> | undefined;
  private revealedText: string | null = null;
  private placement: BoxPlacement;
  private offset: BoxOffset | null = null;
  private shownTop = 0;
  private controlsLift = 0;
  private drag: BoxDrag | null = null;
  private clickEndsDrag = false;

  constructor(
    container: Element,
    onCommand: (command: StudyCommand) => void = () => undefined,
    placement: BoxPlacement = DEFAULT_PLACEMENT,
    private readonly onPlacementChange: (placement: BoxPlacement) => void = () => undefined,
  ) {
    this.placement = placement;
    this.document = container.ownerDocument;
    this.english = this.element('p', 'english');
    this.english.lang = 'en';
    this.portuguese = this.element('p', 'portuguese');
    this.portuguese.lang = 'pt-BR';
    this.subtitle = this.element('div', 'subtitle', this.english, this.portuguese);
    this.subtitle.hidden = true;
    this.strip = new StudyStrip(this.document, onCommand);
    this.box = this.element('div', 'box', this.strip.element, this.subtitle);
    this.box.hidden = true;
    for (const type of ISOLATED_EVENTS) {
      this.box.addEventListener(type, (event) => {
        event.stopPropagation();
      });
    }
    this.box.addEventListener('focusin', () => {
      this.stripFocused = true;
      this.renderBox();
    });
    this.box.addEventListener('focusout', (event) => {
      this.stripFocused = this.box.contains(event.relatedTarget as Node | null);
      this.renderBox();
    });
    this.status = this.element('div', 'status');
    this.status.setAttribute('role', 'status');
    this.announcer = this.element('p', 'announcer');
    this.announcer.setAttribute('role', 'status');
    this.announcer.lang = 'pt-BR';
    this.frame = this.element('div', 'frame', this.box, this.status, this.announcer);
    container.append(this.frame);
    this.listenForMoves(this.strip.handle);
    const resizeObserver = new ResizeObserver(() => {
      this.place();
    });
    resizeObserver.observe(this.frame);
    resizeObserver.observe(this.box);
  }

  setControlsLift(liftPx: number): void {
    this.controlsLift = liftPx;
    this.frame.style.setProperty('--controls-lift', `${String(liftPx)}px`);
    this.place();
  }

  showCues(english: readonly Cue[], portuguese: readonly Cue[] = NO_CUES): void {
    if (english === this.shownEnglish && portuguese === this.shownPortuguese) return;
    this.shownEnglish = english;
    this.shownPortuguese = portuguese;

    this.english.textContent = textOf(english);
    this.subtitle.hidden = english.length === 0 && portuguese.length === 0;
    this.renderPortuguese();
    this.renderBox();
    if (!this.subtitle.hidden) this.hideNotice();
  }

  setSpeed(speed: number): void {
    this.strip.setSpeed(speed);
  }

  setAutoPause(enabled: boolean): void {
    this.strip.setAutoPause(enabled);
  }

  setRepeatAvailable(available: boolean): void {
    this.strip.setRepeatAvailable(available);
  }

  setBlurred(blurred: boolean): void {
    this.strip.setBlurred(blurred);
    this.box.classList.toggle('blurred', blurred);
  }

  revealPortuguese(): void {
    this.revealedText = textOf(this.shownPortuguese);
    this.portuguese.classList.add('revealed');
  }

  setStudyState(available: boolean, paused: boolean): void {
    if (available === this.studyAvailable && paused === this.stripPinned) return;
    this.studyAvailable = available;
    this.stripPinned = paused;
    this.renderBox();
  }

  flashStrip(): void {
    clearTimeout(this.stripFlashTimer);
    this.stripFlashTimer = setTimeout(() => {
      this.stripFlashTimer = undefined;
      this.renderBox();
    }, STRIP_FLASH_MS);
    this.renderBox();
  }

  showTranslationState(state: TranslationState | null): void {
    const changedKind = state?.kind !== this.translationState?.kind;
    this.translationState = state;
    if (changedKind) {
      clearTimeout(this.translationStateTimer);
      this.announcer.textContent = state ? TRANSLATION_STATES[state.kind] : '';
      if (state && !LASTING_STATES.has(state.kind)) {
        this.translationStateTimer = setTimeout(() => {
          this.showTranslationState(null);
        }, NOTICE_MS);
      }
    }
    this.renderPortuguese();
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

  private renderBox(): void {
    const flashing = this.stripFlashTimer !== undefined;
    const stripShown = this.studyAvailable && (this.stripPinned || this.stripFocused || flashing);
    this.strip.element.classList.toggle('shown', stripShown);
    this.box.classList.toggle('study', this.studyAvailable);
    this.box.hidden = this.subtitle.hidden && !stripShown;
  }

  private listenForMoves(handle: HTMLButtonElement): void {
    handle.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || !this.offset) return;
      handle.setPointerCapture(event.pointerId);
      this.clickEndsDrag = false;
      this.drag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        left: this.offset.left,
        top: this.shownTop,
        moved: false,
      };
    });
    handle.addEventListener('pointermove', (event) => {
      const drag = this.drag;
      if (drag?.pointerId !== event.pointerId) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      drag.moved = true;
      this.box.classList.add('dragging');
      this.moveTo(drag.left + dx, drag.top + dy);
    });
    const endDrag = (event: PointerEvent): void => {
      if (this.drag?.pointerId !== event.pointerId) return;
      this.clickEndsDrag = this.drag.moved;
      if (this.drag.moved) this.onPlacementChange(this.placement);
      this.drag = null;
      this.box.classList.remove('dragging');
      this.place();
    };
    handle.addEventListener('pointerup', endDrag);
    handle.addEventListener('pointercancel', endDrag);
    handle.addEventListener('click', () => {
      if (this.clickEndsDrag) {
        this.clickEndsDrag = false;
        return;
      }
      this.placeWithoutTransition(toggledEdge(this.placement));
      this.onPlacementChange(this.placement);
    });
    handle.addEventListener('keydown', (event) => {
      const step = ARROW_STEPS[event.key];
      if (!step || !this.offset || event.altKey || event.ctrlKey || event.metaKey) return;
      event.preventDefault();
      const frame = this.frameSize();
      this.moveTo(
        this.offset.left + step.x * KEY_STEP * frame.width,
        this.shownTop + step.y * KEY_STEP * frame.height,
      );
      this.onPlacementChange(this.placement);
    });
  }

  private moveTo(left: number, top: number): void {
    const frame = this.frameSize();
    if (frame.width === 0 || frame.height === 0) return;
    this.placeWithoutTransition(placementAt(left, top, frame, this.boxSize()));
  }

  private placeWithoutTransition(placement: BoxPlacement): void {
    this.placement = placement;
    this.box.classList.add('moving');
    this.place();
    this.box.getBoundingClientRect();
    this.box.classList.remove('moving');
  }

  private place(): void {
    if (this.box.hidden) return;
    const frame = this.frameSize();
    const box = this.boxSize();
    const offset = offsetFor(this.placement, frame, box);
    this.offset = offset;
    const top = topOf(offset, frame, box);
    const bottomGap = frame.height - top - box.height;
    const liftShift =
      this.controlsLift > 0
        ? Math.min(top, Math.max(0, this.controlsLift + CONTROLS_GAP_PX - bottomGap))
        : 0;
    this.shownTop = top - liftShift;
    this.box.style.left = `${String(offset.left)}px`;
    this.box.style.top = offset.edge === 'top' ? `${String(offset.distance)}px` : '';
    this.box.style.bottom = offset.edge === 'bottom' ? `${String(offset.distance)}px` : '';
    this.box.style.setProperty('--lift-shift', `${String(liftShift)}px`);
    if (!this.drag?.moved) this.box.classList.toggle('top-edge', offset.edge === 'top');
  }

  private frameSize(): Size {
    return { width: this.frame.clientWidth, height: this.frame.clientHeight };
  }

  private boxSize(): Size {
    const { width, height } = this.box.getBoundingClientRect();
    return { width, height };
  }

  private renderPortuguese(): void {
    const portuguese = this.shownPortuguese;
    const state = this.translationState;
    this.portuguese.classList.toggle('translation-state', portuguese.length === 0 && !!state);
    if (portuguese.length > 0) {
      const text = textOf(portuguese);
      if (this.revealedText !== null && text !== this.revealedText) {
        this.revealedText = null;
        this.portuguese.classList.remove('revealed');
      }
      this.portuguese.textContent = text;
    } else if (state) {
      this.portuguese.replaceChildren(TRANSLATION_STATES[state.kind]);
      if (state.kind === 'downloading') {
        const percent = this.element('span', 'percent');
        percent.textContent = ` ${String(Math.round(state.progress * 100))}%`;
        percent.setAttribute('aria-hidden', 'true');
        this.portuguese.append(percent);
      }
    } else {
      this.portuguese.replaceChildren();
    }
    this.portuguese.hidden = portuguese.length === 0 && !state;
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
