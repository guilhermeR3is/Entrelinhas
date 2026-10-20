import type { KeyProblem } from '../../study/key-rules';
import { keyLabel, type KeyBinding, type StudyCommand } from '../../study/study-keys';

export const COMMAND_TEXT: Record<StudyCommand, { name: string; description: string }> = {
  slower: { name: 'Mais devagar', description: 'Diminui a velocidade do vídeo em 0,05.' },
  faster: { name: 'Mais rápido', description: 'Aumenta a velocidade do vídeo em 0,05.' },
  'auto-pause': {
    name: 'Pausar no fim',
    description: 'Liga ou desliga a pausa no fim de cada frase.',
  },
  repeat: { name: 'Repetir', description: 'Volta ao começo da frase e toca de novo.' },
  'repeat-slow': {
    name: 'Repetir devagar',
    description: 'Repete a frase em 0,75x e depois volta à sua velocidade.',
  },
  blur: { name: 'Borrar português', description: 'Liga ou desliga o borrado da tradução.' },
  reveal: {
    name: 'Mostrar português',
    description: 'Mostra a tradução borrada até a próxima fala.',
  },
};

export const WAITING_FOR_KEY = 'Aperte a nova tecla… Esc cancela.';
export const SAVE_FAILED = 'Não deu para salvar. Tente de novo.';
export const READ_FAILED = 'Não deu para ler os atalhos. Mostrando as teclas padrão.';

export function problemMessage(problem: KeyProblem, binding: KeyBinding | null): string {
  const label = binding ? keyLabel(binding) : '';
  switch (problem.kind) {
    case 'not-a-letter':
      return 'Use uma letra, com ou sem Shift.';
    case 'site':
      return problem.shortcut.use
        ? `O YouTube usa ${label} para ${problem.shortcut.use}. Escolha outra.`
        : `O YouTube já usa ${label}. Escolha outra.`;
    case 'taken':
      return `${label} já é a tecla de ${COMMAND_TEXT[problem.by].name}.`;
  }
}

export function changedAnnouncement(command: StudyCommand, binding: KeyBinding): string {
  return `${COMMAND_TEXT[command].name}: tecla ${keyLabel(binding)}`;
}
