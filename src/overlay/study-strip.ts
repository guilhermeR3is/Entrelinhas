import { MAX_SPEED, MIN_SPEED } from '../study/playback-speed';
import { DEFAULT_KEYS, keyLabel, type StudyCommand, type StudyKeys } from '../study/study-keys';

const SPEED_FORMAT = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

export function formatSpeed(speed: number): string {
  return `${SPEED_FORMAT.format(speed)}x`;
}

export class StudyStrip {
  readonly element: HTMLElement;
  readonly handle: HTMLButtonElement;
  private readonly slower: HTMLButtonElement;
  private readonly faster: HTMLButtonElement;
  private readonly autoPause: HTMLButtonElement;
  private readonly repeat: HTMLButtonElement;
  private readonly blur: HTMLButtonElement;
  private readonly speedValue: HTMLOutputElement;
  private readonly buttonsByCommand = new Map<StudyCommand, HTMLButtonElement>();

  constructor(
    private readonly document: Document,
    onCommand: (command: StudyCommand) => void,
  ) {
    this.handle = document.createElement('button');
    this.handle.type = 'button';
    this.handle.className = 'handle';
    this.handle.textContent = 'Mover';
    this.handle.setAttribute('aria-label', 'Mover a legenda');
    this.handle.setAttribute('aria-describedby', 'move-hint');
    const moveHint = document.createElement('span');
    moveHint.id = 'move-hint';
    moveHint.className = 'visually-hidden';
    moveHint.textContent = 'Arraste ou use as setas. Enter leva a legenda para cima ou para baixo.';
    this.slower = this.button('−', 'slower', 'Mais devagar', onCommand);
    this.faster = this.button('+', 'faster', 'Mais rápido', onCommand);
    this.autoPause = this.button('Pausar no fim', 'auto-pause', null, onCommand);
    this.autoPause.classList.add('separated');
    this.repeat = this.button('Repetir', 'repeat', null, onCommand);
    this.blur = this.button('Borrar português', 'blur', null, onCommand);
    this.speedValue = document.createElement('output');
    this.speedValue.className = 'speed';
    this.speedValue.setAttribute('aria-label', 'Velocidade');

    this.element = document.createElement('div');
    this.element.className = 'strip';
    this.element.setAttribute('role', 'group');
    this.element.setAttribute('aria-label', 'Controles de estudo');
    this.element.append(
      this.handle,
      moveHint,
      this.slower,
      this.speedValue,
      this.faster,
      this.autoPause,
      this.repeat,
      this.blur,
    );
    this.element.addEventListener('mousedown', (event) => {
      event.preventDefault();
    });
    this.setSpeed(1);
    this.setKeys(DEFAULT_KEYS);
  }

  setKeys(keys: StudyKeys): void {
    for (const [command, button] of this.buttonsByCommand) {
      const label = keyLabel(keys[command]);
      button.setAttribute('aria-keyshortcuts', label);
      const hint = button.querySelector('kbd');
      if (hint) hint.textContent = label;
    }
  }

  setSpeed(speed: number): void {
    this.speedValue.textContent = formatSpeed(speed);
    this.slower.setAttribute('aria-disabled', String(speed <= MIN_SPEED));
    this.faster.setAttribute('aria-disabled', String(speed >= MAX_SPEED));
  }

  setAutoPause(enabled: boolean): void {
    this.autoPause.setAttribute('aria-pressed', String(enabled));
  }

  setBlurred(blurred: boolean): void {
    this.blur.setAttribute('aria-pressed', String(blurred));
  }

  setRepeatAvailable(available: boolean): void {
    this.repeat.setAttribute('aria-disabled', String(!available));
  }

  private button(
    text: string,
    command: StudyCommand,
    label: string | null,
    onCommand: (command: StudyCommand) => void,
  ): HTMLButtonElement {
    const button = this.document.createElement('button');
    button.type = 'button';
    if (label) button.setAttribute('aria-label', label);
    const hint = this.document.createElement('kbd');
    hint.setAttribute('aria-hidden', 'true');
    button.append(text, hint);
    button.addEventListener('click', () => {
      if (button.getAttribute('aria-disabled') !== 'true') onCommand(command);
    });
    this.buttonsByCommand.set(command, button);
    return button;
  }
}
