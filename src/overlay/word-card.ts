export type WordMeaning =
  | { kind: 'translating' }
  | { kind: 'translated'; text: string }
  | { kind: 'not-ready' }
  | { kind: 'unsupported' }
  | { kind: 'failed' };

export type WordSaving = 'idle' | 'busy' | 'failed';

export interface WordCardHandlers {
  onSave: () => void;
  onClose: () => void;
}

const MEANING_STATES: Record<Exclude<WordMeaning['kind'], 'translated'>, string> = {
  translating: 'Traduzindo…',
  'not-ready': 'O português ainda não está pronto.',
  unsupported: 'Este navegador não traduz para o português.',
  failed: 'Não deu para traduzir esta palavra.',
};

export class WordCard {
  readonly element: HTMLElement;
  private readonly headword: HTMLElement;
  private readonly wordClass: HTMLElement;
  private readonly meaning: HTMLElement;
  private readonly problem: HTMLElement;
  private readonly saveButton: HTMLButtonElement;

  constructor(
    private readonly document: Document,
    handlers: WordCardHandlers,
  ) {
    this.headword = this.child('strong', 'headword');
    this.headword.lang = 'en';
    this.wordClass = this.child('em', 'word-class');
    this.meaning = this.child('p', 'meaning');
    this.meaning.lang = 'pt-BR';
    this.meaning.setAttribute('aria-live', 'polite');
    this.problem = this.child('p', 'word-problem');
    this.problem.setAttribute('role', 'status');
    this.saveButton = this.button('Salvar', handlers.onSave);
    this.saveButton.setAttribute('aria-label', 'Salvar para revisar');
    const closeButton = this.button('Fechar', handlers.onClose);
    closeButton.setAttribute('aria-keyshortcuts', 'Escape');

    this.element = this.child(
      'section',
      'word-card',
      this.child('p', 'entry-line', this.headword, this.wordClass),
      this.meaning,
      this.problem,
      this.child('p', 'word-actions', this.saveButton, closeButton),
    );
    this.element.setAttribute('aria-label', 'Palavra da legenda');
    this.element.hidden = true;
  }

  get shown(): boolean {
    return !this.element.hidden;
  }

  show(word: string, wordClass: string | null): void {
    this.headword.textContent = word;
    this.wordClass.textContent = wordClass ?? '';
    this.wordClass.hidden = wordClass === null;
    this.setMeaning({ kind: 'translating' });
    this.setSaving(false, 'idle');
    this.element.hidden = false;
  }

  hide(): void {
    if (this.element.contains(this.document.activeElement)) {
      (this.document.activeElement as HTMLElement).blur();
    }
    this.element.hidden = true;
  }

  setMeaning(meaning: WordMeaning): void {
    const translated = meaning.kind === 'translated';
    this.meaning.textContent = translated ? meaning.text : MEANING_STATES[meaning.kind];
    this.meaning.classList.toggle('pending', !translated);
  }

  setSaving(saved: boolean, saving: WordSaving): void {
    this.saveButton.textContent = saved ? 'Salva' : 'Salvar';
    this.saveButton.setAttribute('aria-pressed', String(saved));
    this.saveButton.setAttribute('aria-disabled', String(saving === 'busy'));
    this.saveButton.toggleAttribute('aria-busy', saving === 'busy');
    this.problem.textContent = saving === 'failed' ? 'Não deu para salvar. Tente de novo.' : '';
    this.problem.hidden = saving !== 'failed';
  }

  private button(label: string, onClick: () => void): HTMLButtonElement {
    const button = this.child('button', 'word-button') as HTMLButtonElement;
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', () => {
      if (button.getAttribute('aria-disabled') !== 'true') onClick();
    });
    return button;
  }

  private child(tag: string, className: string, ...children: Node[]): HTMLElement {
    const element = this.document.createElement(tag);
    element.className = className;
    element.append(...children);
    return element;
  }
}
