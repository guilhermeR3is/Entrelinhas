import { logger } from '../logger';

const SHOW_TEXT = 4;
const LEARNED_MS = 5000;
const BLOCKED_EVENTS = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'dblclick'];

type PickerMessage = { wordClass: string; definition: string };

const MESSAGES = {
  choosing: { wordClass: 'escolher', definition: 'Clique na legenda do vídeo. Esc cancela.' },
  noText: { wordClass: 'escolher', definition: 'Esse elemento não tem texto. Tente na legenda.' },
  notSaved: {
    wordClass: 'escolher',
    definition: 'Não deu para guardar essa legenda. Tente clicar no texto dela.',
  },
  learned: { wordClass: 'aprendida', definition: 'A legenda dupla vai ler este texto.' },
} satisfies Record<string, PickerMessage>;

export type LearnCaption = (element: Element) => Promise<boolean>;

export class CaptionPicker {
  private readonly page: Document;
  private readonly root: HTMLElement;
  private readonly strip: HTMLElement;
  private readonly outline: HTMLElement;
  private readonly listeners = new AbortController();
  private hovered: Element | null = null;
  private frame = 0;
  private learning = false;
  private closeTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    container: HTMLElement,
    private readonly video: HTMLVideoElement,
    private readonly learn: LearnCaption,
    private readonly onDone: () => void,
  ) {
    this.page = container.ownerDocument;
    this.strip = this.page.createElement('div');
    this.strip.className = 'notice picker-strip';
    this.strip.setAttribute('role', 'status');
    this.outline = this.page.createElement('div');
    this.outline.className = 'picker-outline';
    this.outline.hidden = true;
    this.root = this.page.createElement('div');
    this.root.className = 'frame picker';
    this.root.append(this.strip, this.outline);
    container.append(this.root);
    this.say(MESSAGES.choosing);

    const window = this.page.defaultView;
    if (!window) return;
    const options = { capture: true, signal: this.listeners.signal };
    window.addEventListener('pointermove', this.follow, options);
    window.addEventListener('click', this.choose, options);
    window.addEventListener('keydown', this.cancelOnEscape, options);
    for (const type of BLOCKED_EVENTS) window.addEventListener(type, this.block, options);
  }

  close(): void {
    this.stopListening();
    clearTimeout(this.closeTimer);
    this.root.remove();
  }

  private readonly follow = (event: PointerEvent): void => {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => {
      this.hovered = this.insideVideo(event)
        ? textElementAt(this.page, event.clientX, event.clientY)
        : null;
      this.drawOutline();
    });
  };

  private readonly block = (event: Event): void => {
    if (event instanceof MouseEvent && this.insideVideo(event)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  };

  private readonly choose = (event: MouseEvent): void => {
    if (!this.insideVideo(event)) {
      this.finish();
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    if (this.learning) return;
    const element = textElementAt(this.page, event.clientX, event.clientY);
    if (!element) {
      this.say(MESSAGES.noText);
      return;
    }
    void this.learnFrom(element);
  };

  private readonly cancelOnEscape = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.finish();
  };

  private async learnFrom(element: Element): Promise<void> {
    this.learning = true;
    let learned = false;
    try {
      learned = await this.learn(element);
    } catch (error) {
      logger.error('Could not learn the caption', error);
    }
    this.learning = false;
    if (!learned) {
      this.say(MESSAGES.notSaved);
      return;
    }
    this.stopListening();
    this.outline.hidden = true;
    this.say(MESSAGES.learned);
    this.onDone();
    this.closeTimer = setTimeout(() => {
      this.root.remove();
    }, LEARNED_MS);
  }

  private finish(): void {
    this.close();
    this.onDone();
  }

  private stopListening(): void {
    this.listeners.abort();
    cancelAnimationFrame(this.frame);
  }

  private insideVideo({ clientX, clientY }: MouseEvent): boolean {
    const box = this.video.getBoundingClientRect();
    return (
      clientX >= box.left && clientX <= box.right && clientY >= box.top && clientY <= box.bottom
    );
  }

  private drawOutline(): void {
    if (!this.hovered) {
      this.outline.hidden = true;
      return;
    }
    const area = this.root.getBoundingClientRect();
    const box = this.hovered.getBoundingClientRect();
    this.outline.hidden = false;
    this.outline.style.left = `${String(box.left - area.left)}px`;
    this.outline.style.top = `${String(box.top - area.top)}px`;
    this.outline.style.width = `${String(box.width)}px`;
    this.outline.style.height = `${String(box.height)}px`;
  }

  private say({ wordClass, definition }: PickerMessage): void {
    const headword = this.page.createElement('strong');
    headword.className = 'headword';
    headword.textContent = 'Legenda dupla';
    const wordClassElement = this.page.createElement('em');
    wordClassElement.className = 'word-class';
    wordClassElement.textContent = wordClass;
    const entry = this.page.createElement('p');
    entry.className = 'entry-line';
    entry.append(headword, wordClassElement);
    const definitionElement = this.page.createElement('p');
    definitionElement.className = 'definition';
    definitionElement.textContent = definition;
    this.strip.replaceChildren(entry, definitionElement);
  }
}

function textElementAt(page: Document, x: number, y: number): Element | null {
  const walker = page.createTreeWalker(page.body, SHOW_TEXT);
  const range = page.createRange();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (!parent || node.textContent?.trim() === '') continue;
    range.selectNodeContents(node);
    for (const rect of Array.from(range.getClientRects())) {
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return parent;
    }
  }
  return null;
}
