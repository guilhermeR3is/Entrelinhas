import { describe, expect, it } from 'vitest';
import { findTranslatorApi } from './translator-api';

describe('findTranslatorApi', () => {
  it('finds the Translator API of the page', () => {
    const Translator = {
      availability: () => Promise.resolve('available'),
      create: () => Promise.resolve({}),
    };
    expect(findTranslatorApi({ Translator })).toBe(Translator);
  });

  it.each([
    ['a browser without it', {}],
    ['something else under the same name', { Translator: 'nope' }],
    ['an old version without create', { Translator: { availability: () => undefined } }],
    ['null', { Translator: null }],
  ])('finds nothing in %s', (_, scope) => {
    expect(findTranslatorApi(scope)).toBeNull();
  });
});
