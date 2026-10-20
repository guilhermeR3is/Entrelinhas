import { logger } from '../logger';
import { SubtitleFormatError } from '../subtitles/cue';
import { SubtitleFileTooLargeError } from '../subtitles/subtitle-file';

const LOADED_MS = 5000;
const NAME_HEAD = 24;
const NAME_TAIL = 12;
const ACCEPTED_FILES = '.srt,.vtt,text/vtt,application/x-subrip';
const ISOLATED_EVENTS = [
  'pointerdown',
  'mousedown',
  'click',
  'dblclick',
  'keydown',
  'keyup',
  'keypress',
];

const MESSAGES = {
  choosing: 'Solte aqui um arquivo .srt ou .vtt.',
  opening: 'Abrindo o arquivo…',
  unreadable: 'Esse arquivo não tem uma legenda .srt ou .vtt que dê para ler.',
  tooLarge: 'Esse arquivo é grande demais para ser uma legenda.',
  failed: 'Não deu para abrir esse arquivo.',
};

export type LoadSubtitleFile = (file: File) => Promise<void>;

export class FileLoader {
  private readonly page: Document;
  private readonly root: HTMLElement;
  private readonly definition: HTMLElement;
  private readonly actions: HTMLElement;
  private readonly chooseButton: HTMLButtonElement;
  private readonly input: HTMLInputElement;
  private readonly dropOutline: HTMLElement;
  private readonly listeners = new AbortController();
  private opening = false;
  private closeTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    container: HTMLElement,
    private readonly video: HTMLVideoElement,
    private readonly load: LoadSubtitleFile,
    private readonly onDone: () => void,
  ) {
    this.page = container.ownerDocument;
    const headword = this.element('strong', 'headword');
    headword.textContent = 'Legenda dupla';
    const wordClass = this.element('em', 'word-class');
    wordClass.textContent = 'arquivo';
    this.definition = this.element('p', 'definition');
    this.definition.setAttribute('role', 'status');
    this.input = this.page.createElement('input');
    this.input.type = 'file';
    this.input.accept = ACCEPTED_FILES;
    this.input.hidden = true;
    this.chooseButton = this.page.createElement('button');
    this.chooseButton.type = 'button';
    this.chooseButton.textContent = 'Escolher arquivo';
    const escapeHint = this.element('span', 'escape-hint');
    escapeHint.textContent = 'Esc cancela.';
    this.actions = this.element('p', 'file-actions', this.chooseButton, escapeHint, this.input);
    const strip = this.element(
      'div',
      'notice picker-strip file-strip',
      this.element('p', 'entry-line', headword, wordClass),
      this.definition,
      this.actions,
    );
    this.dropOutline = this.element('div', 'drop-outline');
    this.dropOutline.hidden = true;
    this.root = this.element('div', 'frame picker', strip, this.dropOutline);
    container.append(this.root);
    this.say(MESSAGES.choosing);

    for (const type of ISOLATED_EVENTS) {
      strip.addEventListener(type, (event) => {
        event.stopPropagation();
      });
    }
    this.chooseButton.addEventListener('click', () => {
      this.input.click();
    });
    this.input.addEventListener('change', () => {
      const file = this.input.files?.[0];
      this.input.value = '';
      if (file) void this.open(file);
    });

    const window = this.page.defaultView;
    if (!window) return;
    const options = { capture: true, signal: this.listeners.signal };
    window.addEventListener('dragenter', this.followDrag, options);
    window.addEventListener('dragover', this.followDrag, options);
    window.addEventListener('dragleave', this.leaveDrag, options);
    window.addEventListener('drop', this.drop, options);
    window.addEventListener('click', this.cancelOutside, options);
    window.addEventListener('keydown', this.cancelOnEscape, options);
    this.chooseButton.focus({ preventScroll: true });
  }

  close(): void {
    this.listeners.abort();
    clearTimeout(this.closeTimer);
    this.root.remove();
  }

  private readonly followDrag = (event: DragEvent): void => {
    const accepted = carriesFiles(event) && this.insideVideo(event);
    this.dropOutline.hidden = !accepted;
    if (!accepted) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  };

  private readonly leaveDrag = (event: DragEvent): void => {
    if (event.relatedTarget === null) this.dropOutline.hidden = true;
  };

  private readonly drop = (event: DragEvent): void => {
    this.dropOutline.hidden = true;
    if (!carriesFiles(event) || !this.insideVideo(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const file = event.dataTransfer?.files[0];
    if (file) void this.open(file);
  };

  private readonly cancelOutside = (event: MouseEvent): void => {
    if (event.composedPath().includes(this.root) || this.insideVideo(event)) return;
    this.finish();
  };

  private readonly cancelOnEscape = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.finish();
  };

  private async open(file: File): Promise<void> {
    if (this.opening) return;
    this.opening = true;
    this.say(MESSAGES.opening, { busy: true });
    try {
      await this.load(file);
    } catch (error) {
      this.opening = false;
      this.say(messageFor(error));
      this.chooseButton.focus({ preventScroll: true });
      return;
    }
    this.listeners.abort();
    this.actions.hidden = true;
    const name = this.element('span', 'file-name');
    name.textContent = shortFileName(file.name);
    this.definition.replaceChildren('Lendo ', name, '. Ajuste o atraso na faixa de estudo.');
    this.onDone();
    this.closeTimer = setTimeout(() => {
      this.root.remove();
    }, LOADED_MS);
  }

  private finish(): void {
    this.close();
    this.onDone();
  }

  private say(definition: string, { busy } = { busy: false }): void {
    this.definition.textContent = definition;
    this.chooseButton.disabled = busy;
    if (busy) this.chooseButton.setAttribute('aria-busy', 'true');
    else this.chooseButton.removeAttribute('aria-busy');
  }

  private insideVideo({ clientX, clientY }: MouseEvent): boolean {
    const box = this.video.getBoundingClientRect();
    return (
      clientX >= box.left && clientX <= box.right && clientY >= box.top && clientY <= box.bottom
    );
  }

  private element(tag: string, className: string, ...children: Node[]): HTMLElement {
    const element = this.page.createElement(tag);
    element.className = className;
    element.append(...children);
    return element;
  }
}

export function shortFileName(name: string): string {
  const characters = Array.from(name);
  if (characters.length <= NAME_HEAD + NAME_TAIL + 1) return name;
  return `${characters.slice(0, NAME_HEAD).join('')}…${characters.slice(-NAME_TAIL).join('')}`;
}

function carriesFiles(event: DragEvent): boolean {
  return event.dataTransfer?.types.includes('Files') ?? false;
}

function messageFor(error: unknown): string {
  if (error instanceof SubtitleFileTooLargeError) return MESSAGES.tooLarge;
  if (error instanceof SubtitleFormatError) return MESSAGES.unreadable;
  logger.error('Could not open the subtitle file', error);
  return MESSAGES.failed;
}
