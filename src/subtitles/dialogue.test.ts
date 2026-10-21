import { expect, it } from 'vitest';
import { isDialogue } from './dialogue';

it('recognizes two speakers marked with a hyphen, an en dash or an em dash', () => {
  expect(isDialogue('- Where are you going?\n- Home.')).toBe(true);
  expect(isDialogue('\u2013 Where are you going?\n\u2013 Home.')).toBe(true);
  expect(isDialogue('\u2014Aonde você vai?\n\u2014Para casa.')).toBe(true);
});

it('ignores blank lines and spaces around the dashes', () => {
  expect(isDialogue('  - Where are you going?\n\n  - Home.  ')).toBe(true);
});

it('counts three speakers too', () => {
  expect(isDialogue('- Ready?\n- Yes.\n- Go!')).toBe(true);
});

it('leaves a sentence split in two lines alone', () => {
  expect(isDialogue('If you want to learn something,\nyou have to practice.')).toBe(false);
});

it('needs every line to start with a dash', () => {
  expect(isDialogue('- Where are you going?\nHome.')).toBe(false);
  expect(isDialogue('[pt] - Aonde você vai?\n- Para casa.')).toBe(false);
});

it('needs more than one line', () => {
  expect(isDialogue('- Where are you going?')).toBe(false);
  expect(isDialogue('')).toBe(false);
});

it('does not take a dash inside the line for a speaker', () => {
  expect(isDialogue('Well - maybe.\nOr not - who knows.')).toBe(false);
});
