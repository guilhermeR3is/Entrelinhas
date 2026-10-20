import { MAX_SPEED, MIN_SPEED } from '../study/playback-speed';
import type { StudyCommand } from '../study/study-keys';

const SPEED_FORMAT = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

export function formatSpeed(speed: number): string {
  return `${SPEED_FORMAT.format(speed)}x`;
}

export class StudyStrip {
  readonly element: HTMLElement;
  private readonly slower: HTMLButtonElement;
  private readonly faster: HTMLButtonElement;
  private readonly autoPause: HTMLButtonElement;
  private readonly repeat: HTMLButtonElement;
  private readonly speedValue: HTMLOutputElement;

  constructor(
    private readonly document: Document,
    onCommand: (command: StudyCommand) => void,
  ) {
    this.slower = this.button('−', 'Z', 'Mais devagar', () => {
      onCommand('slower');
    });
    this.faster = this.button('+', 'X', 'Mais rápido', () => {
      onCommand('faster');
    });
    this.autoPause = this.button('Pausar no fim', 'P', null, () => {
      onCommand('auto-pause');
    });
    this.autoPause.classList.add('separated');
    this.repeat = this.button('Repetir', 'R', null, () => {
      onCommand('repeat');
    });
    this.speedValue = document.createElement('output');
    this.speedValue.className = 'speed';
    this.speedValue.setAttribute('aria-label', 'Velocidade');

    this.element = document.createElement('div');
    this.element.className = 'strip';
    this.element.setAttribute('role', 'group');
    this.element.setAttribute('aria-label', 'Controles de estudo');
    this.element.append(this.slower, this.speedValue, this.faster, this.autoPause, this.repeat);
    this.element.addEventListener('mousedown', (event) => {
      event.preventDefault();
    });
    this.setSpeed(1);
  }

  setSpeed(speed: number): void {
    this.speedValue.textContent = formatSpeed(speed);
    this.slower.setAttribute('aria-disabled', String(speed <= MIN_SPEED));
    this.faster.setAttribute('aria-disabled', String(speed >= MAX_SPEED));
  }

  setAutoPause(enabled: boolean): void {
    this.autoPause.setAttribute('aria-pressed', String(enabled));
  }

  setRepeatAvailable(available: boolean): void {
    this.repeat.setAttribute('aria-disabled', String(!available));
  }

  private button(
    text: string,
    key: string,
    label: string | null,
    onPress: () => void,
  ): HTMLButtonElement {
    const button = this.document.createElement('button');
    button.type = 'button';
    if (label) button.setAttribute('aria-label', label);
    button.setAttribute('aria-keyshortcuts', key);
    const hint = this.document.createElement('kbd');
    hint.textContent = key;
    hint.setAttribute('aria-hidden', 'true');
    button.append(text, hint);
    button.addEventListener('click', () => {
      if (button.getAttribute('aria-disabled') !== 'true') onPress();
    });
    return button;
  }
}
