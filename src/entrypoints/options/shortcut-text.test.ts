import { describe, expect, it } from 'vitest';
import { problemWith } from '../../study/key-rules';
import { DEFAULT_KEYS, STUDY_COMMANDS } from '../../study/study-keys';
import { changedAnnouncement, COMMAND_TEXT, problemMessage } from './shortcut-text';

function messageFor(key: string, shift = false): string | null {
  const binding = { key, shift };
  const problem = problemWith('slower', binding, DEFAULT_KEYS);
  return problem && problemMessage(problem, binding);
}

describe('problemMessage', () => {
  it('says what YouTube does with the key', () => {
    expect(messageFor('k')).toBe('O YouTube usa K para pausar ou continuar. Escolha outra.');
    expect(messageFor('n', true)).toBe(
      'O YouTube usa Shift+N para passar para o próximo vídeo. Escolha outra.',
    );
  });

  it('only says YouTube uses the key when its use was not checked', () => {
    expect(messageFor('t')).toBe('O YouTube já usa T. Escolha outra.');
  });

  it('names the control that already has the key', () => {
    expect(messageFor('b')).toBe('B já é a tecla de Borrar português.');
    expect(messageFor('r', true)).toBe('Shift+R já é a tecla de Repetir devagar.');
  });

  it('asks for a letter when the key is not one', () => {
    expect(problemMessage({ kind: 'not-a-letter' }, null)).toBe('Use uma letra, com ou sem Shift.');
  });
});

describe('COMMAND_TEXT', () => {
  it('names and explains every control', () => {
    for (const command of STUDY_COMMANDS) {
      expect(COMMAND_TEXT[command].name).not.toBe('');
      expect(COMMAND_TEXT[command].description).toMatch(/\.$/);
    }
  });
});

describe('changedAnnouncement', () => {
  it('tells the control and its new key', () => {
    expect(changedAnnouncement('slower', { key: 'q', shift: false })).toBe('Mais devagar: tecla Q');
  });
});
