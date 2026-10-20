import { describe, expect, it } from 'vitest';
import { bindingFor, keysProblem, problemWith } from './key-rules';
import { DEFAULT_KEYS } from './study-keys';

function pressed(key: string, modifiers: Partial<KeyboardEvent> = {}) {
  return { key, shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, ...modifiers };
}

describe('bindingFor', () => {
  it('takes a letter, with or without Shift, as a lowercase key', () => {
    expect(bindingFor(pressed('q'))).toEqual({ key: 'q', shift: false });
    expect(bindingFor(pressed('Q', { shiftKey: true }))).toEqual({ key: 'q', shift: true });
    expect(bindingFor(pressed('Ç', { shiftKey: true }))).toEqual({ key: 'ç', shift: true });
  });

  it('refuses keys that are not a letter or that use Ctrl, Alt or Cmd', () => {
    expect(bindingFor(pressed('1'))).toBeNull();
    expect(bindingFor(pressed(' '))).toBeNull();
    expect(bindingFor(pressed('ArrowLeft'))).toBeNull();
    expect(bindingFor(pressed('Shift', { shiftKey: true }))).toBeNull();
    expect(bindingFor(pressed('q', { ctrlKey: true }))).toBeNull();
    expect(bindingFor(pressed('q', { altKey: true }))).toBeNull();
    expect(bindingFor(pressed('q', { metaKey: true }))).toBeNull();
  });
});

describe('problemWith', () => {
  it('accepts a free letter', () => {
    expect(problemWith('slower', { key: 'q', shift: false }, DEFAULT_KEYS)).toBeNull();
    expect(
      problemWith(
        'blur',
        { key: 'p', shift: false },
        { ...DEFAULT_KEYS, 'auto-pause': { key: 'o', shift: false } },
      ),
    ).toBeNull();
  });

  it('refuses a key YouTube uses and says what it does there', () => {
    expect(problemWith('slower', { key: 'k', shift: false }, DEFAULT_KEYS)).toEqual({
      kind: 'site',
      shortcut: { key: 'k', shift: null, use: 'pausar ou continuar' },
    });
    expect(problemWith('slower', { key: 'k', shift: true }, DEFAULT_KEYS)?.kind).toBe('site');
  });

  it('refuses Shift+N and Shift+P but leaves N and P without Shift free', () => {
    expect(problemWith('slower', { key: 'n', shift: true }, DEFAULT_KEYS)?.kind).toBe('site');
    expect(problemWith('slower', { key: 'n', shift: false }, DEFAULT_KEYS)).toBeNull();
    expect(problemWith('auto-pause', { key: 'p', shift: true }, DEFAULT_KEYS)?.kind).toBe('site');
  });

  it('refuses a key another control already uses and names that control', () => {
    expect(problemWith('slower', { key: 'b', shift: false }, DEFAULT_KEYS)).toEqual({
      kind: 'taken',
      by: 'blur',
    });
    expect(problemWith('slower', { key: 'r', shift: true }, DEFAULT_KEYS)).toEqual({
      kind: 'taken',
      by: 'repeat-slow',
    });
  });

  it('lets a control keep its own key', () => {
    expect(problemWith('blur', { key: 'b', shift: false }, DEFAULT_KEYS)).toBeNull();
  });

  it('refuses a stored key that is not a single letter', () => {
    expect(problemWith('blur', { key: 'bb', shift: false }, DEFAULT_KEYS)).toEqual({
      kind: 'not-a-letter',
    });
  });
});

describe('keysProblem', () => {
  it('finds nothing wrong in the default keys', () => {
    expect(keysProblem(DEFAULT_KEYS)).toBeNull();
  });

  it('finds two controls on the same key', () => {
    expect(keysProblem({ ...DEFAULT_KEYS, reveal: { key: 'b', shift: false } })?.kind).toBe(
      'taken',
    );
  });
});
