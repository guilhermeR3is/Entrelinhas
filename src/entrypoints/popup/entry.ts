import type { TabStatus } from '../../tab-status';

export type EntryState =
  TabStatus | { kind: 'denied'; site: string; origin: string } | { kind: 'error' };

export type EntryAction = 'activate' | 'deactivate' | 'pick' | 'load' | 'retry';

export interface Entry {
  headword: string;
  wordClass: string;
  definition: string;
  thumbTab: 'lit' | 'hidden';
  action: EntryAction | null;
  links: readonly EntryAction[];
}

export const ACTION_LABELS: Record<EntryAction, string> = {
  activate: 'Ativar neste site',
  deactivate: 'Desativar neste site',
  pick: 'Escolher a legenda na tela',
  load: 'Carregar arquivo de legenda',
  retry: 'Tentar de novo',
};

export function entryFor(state: EntryState): Entry {
  switch (state.kind) {
    case 'active':
      return {
        headword: state.site,
        wordClass: 'site compatível',
        definition: 'Ativa aqui.',
        thumbTab: 'lit',
        action: null,
        links: [],
      };
    case 'available':
      return {
        headword: state.site,
        wordClass: 'não ativado',
        definition: 'Ative para ver a legenda dupla nos vídeos daqui.',
        thumbTab: 'hidden',
        action: 'activate',
        links: [],
      };
    case 'enabled':
      return {
        headword: state.site,
        wordClass: 'ativado por você',
        definition: 'Ativa aqui.',
        thumbTab: 'lit',
        action: 'pick',
        links: ['load', 'deactivate'],
      };
    case 'denied':
      return {
        headword: state.site,
        wordClass: 'não ativado',
        definition: 'O Chrome ficou sem a permissão. Pode tentar de novo.',
        thumbTab: 'hidden',
        action: 'activate',
        links: [],
      };
    case 'unsupported':
      return {
        headword: 'Esta página',
        wordClass: 'não compatível',
        definition: 'Funciona em sites com endereço https.',
        thumbTab: 'hidden',
        action: null,
        links: [],
      };
    case 'error':
      return {
        headword: 'Esta aba',
        wordClass: 'sem resposta',
        definition: 'Não deu para verificar agora.',
        thumbTab: 'hidden',
        action: 'retry',
        links: [],
      };
  }
}

export function thumbTabLetter(headword: string): string {
  return headword.charAt(0).toLocaleUpperCase('pt-BR');
}
