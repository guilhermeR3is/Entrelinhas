import type { TabStatus } from '../../tab-status';
import type { PlayerFrame } from '../../universal/player-frames';

type SiteFields = { site: string; origin: string };
type PlayerState = SiteFields &
  PlayerFrame & { kind: 'player-needed' | 'player-denied' | 'player-enabled' };

export type EntryState =
  | TabStatus
  | (SiteFields & { kind: 'denied' | 'caption-missing' | 'stopped' | 'turned-off' })
  | { kind: 'stopped' | 'turned-off'; site: string }
  | PlayerState
  | { kind: 'error' };

export type EntryAction =
  | 'activate'
  | 'activate-player'
  | 'deactivate'
  | 'turn-off'
  | 'turn-on'
  | 'pick'
  | 'load'
  | 'reload'
  | 'retry';

export interface Entry {
  headword: string;
  wordClass: string;
  definition: string;
  definitionTerm: string | null;
  thumbTab: 'lit' | 'hidden';
  action: EntryAction | null;
  links: readonly EntryAction[];
}

export const ACTION_LABELS: Record<EntryAction, string> = {
  activate: 'Ativar neste site',
  'activate-player': 'Ativar também no player',
  deactivate: 'Tirar o acesso a este site',
  'turn-off': 'Desligar a legenda dupla',
  'turn-on': 'Ligar a legenda dupla',
  pick: 'Escolher a legenda na tela',
  load: 'Carregar arquivo de legenda',
  reload: 'Recarregar a página',
  retry: 'Tentar de novo',
};

export function entryFor(state: EntryState): Entry {
  switch (state.kind) {
    case 'active':
      return {
        headword: state.site,
        wordClass: 'site compatível',
        definitionTerm: null,
        definition: 'Ativa aqui.',
        thumbTab: 'lit',
        action: null,
        links: ['turn-off'],
      };
    case 'available':
      return {
        headword: state.site,
        wordClass: 'não ativado',
        definitionTerm: null,
        definition: 'Ative para ver a legenda dupla nos vídeos daqui.',
        thumbTab: 'hidden',
        action: 'activate',
        links: [],
      };
    case 'enabled':
      return {
        headword: state.site,
        wordClass: 'ativado por você',
        definitionTerm: null,
        definition: 'Ativa aqui.',
        thumbTab: 'lit',
        action: 'pick',
        links: ['load', 'turn-off', 'deactivate'],
      };
    case 'denied':
      return {
        headword: state.site,
        wordClass: 'não ativado',
        definitionTerm: null,
        definition: 'O Chrome ficou sem a permissão. Pode tentar de novo.',
        thumbTab: 'hidden',
        action: 'activate',
        links: [],
      };
    case 'player-needed':
      return {
        headword: state.site,
        wordClass: 'ativado por você',
        definitionTerm: state.player,
        definition: 'O vídeo desta página está num player de outro endereço:',
        thumbTab: 'lit',
        action: 'activate-player',
        links: ['turn-off', 'deactivate'],
      };
    case 'player-denied':
      return {
        headword: state.site,
        wordClass: 'ativado por você',
        definitionTerm: null,
        definition: 'O Chrome ficou sem a permissão do player. Pode tentar de novo.',
        thumbTab: 'lit',
        action: 'activate-player',
        links: ['turn-off', 'deactivate'],
      };
    case 'player-enabled':
      return {
        headword: state.site,
        wordClass: 'ativado por você',
        definitionTerm: null,
        definition: 'Player ativado. Recarregue a página para a legenda aparecer nele.',
        thumbTab: 'lit',
        action: 'reload',
        links: ['turn-off', 'deactivate'],
      };
    case 'caption-missing':
      return {
        headword: state.site,
        wordClass: 'ativado por você',
        definitionTerm: null,
        definition:
          'A legenda que você escolheu não apareceu neste vídeo. Se o site mudou, escolha de novo.',
        thumbTab: 'lit',
        action: 'pick',
        links: ['load', 'turn-off', 'deactivate'],
      };
    case 'stopped':
      return {
        headword: state.site,
        wordClass: 'parou aqui',
        definitionTerm: null,
        definition: 'A legenda dupla parou por um erro. O vídeo continua normal.',
        thumbTab: 'hidden',
        action: 'reload',
        links: 'origin' in state ? ['deactivate'] : [],
      };
    case 'turned-off':
      return {
        headword: state.site,
        wordClass: 'desligada por você',
        definitionTerm: null,
        definition: 'A legenda dupla não aparece aqui. O vídeo mostra a legenda do próprio site.',
        thumbTab: 'hidden',
        action: 'turn-on',
        links: 'origin' in state ? ['deactivate'] : [],
      };
    case 'unsupported':
      return {
        headword: 'Esta página',
        wordClass: 'não compatível',
        definitionTerm: null,
        definition: 'Funciona em sites com endereço https.',
        thumbTab: 'hidden',
        action: null,
        links: [],
      };
    case 'error':
      return {
        headword: 'Esta aba',
        wordClass: 'sem resposta',
        definitionTerm: null,
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
