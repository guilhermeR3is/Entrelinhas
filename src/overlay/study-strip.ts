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
    this.speedValue = document.createElement('output');
    this.speedValue.className = 'speed';
    this.speedValue.setAttribute('aria-label', 'Velocidade');

    this.element = document.createElement('div');
    this.element.className = 'strip';
    this.element.setAttribute('role', 'group');
    this.element.setAttribute('aria-label', 'Controles de estudo');
    this.element.append(this.slower, this.speedValue, this.faster);
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

  private button(
    symbol: string,
    key: string,
    label: string,
    onPress: () => void,
  ): HTMLButtonElement {
    const button = this.document.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-keyshortcuts', key);
    const hint = this.document.createElement('kbd');
    hint.textContent = key;
    button.append(symbol, hint);
    button.addEventListener('click', () => {
      if (button.getAttribute('aria-disabled') !== 'true') onPress();
    });
    return button;
  }
}
