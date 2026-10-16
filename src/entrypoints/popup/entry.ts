import type { TabStatus } from '../../tab-status';

export type EntryState = TabStatus | { kind: 'error' };

export interface Entry {
  headword: string;
  wordClass: string;
  definition: string;
  thumbTab: 'lit' | 'hidden';
  retry: boolean;
}

export function entryFor(state: EntryState): Entry {
  switch (state.kind) {
    case 'active':
      return {
        headword: state.site,
        wordClass: 'site suportado',
        definition: 'Ativa neste site.',
        thumbTab: 'lit',
        retry: false,
      };
    case 'inactive':
      return {
        headword: 'Este site',
        wordClass: 'site não suportado',
        definition: 'Ainda não funciona aqui. Por enquanto, só no YouTube.',
        thumbTab: 'hidden',
        retry: false,
      };
    case 'error':
      return {
        headword: 'Esta aba',
        wordClass: 'não verificada',
        definition: 'Não deu para verificar agora.',
        thumbTab: 'hidden',
        retry: true,
      };
  }
}

export function thumbTabLetter(headword: string): string {
  return headword.charAt(0).toLocaleUpperCase('pt-BR');
}
