import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { Cue } from '../subtitles/cue';
import type { SubtitleTrack } from '../subtitles/subtitle-track';
import { findCachedTranslations, saveTranslations } from './cache-client';
import { CueTranslator } from './cue-translator';
import type { Translator } from './translator-api';
import { serveTranslationCache } from './translation-service';

const EN_PT = { sourceLanguage: 'en', targetLanguage: 'pt' };

function cuesOf(...texts: string[]): Cue[] {
  return texts.map((text, index) => ({
    id: index,
    startMs: index * 1000,
    endMs: index * 1000 + 900,
    text,
    lang: 'en',
  }));
}

function fakeTranslator(onTranslate: (text: string) => void = () => undefined) {
  const asked: string[] = [];
  const translator: Translator = {
    translate: (text, options) => {
      asked.push(text);
      onTranslate(text);
      options?.signal?.throwIfAborted();
      return Promise.resolve(`pt:${text}`);
    },
    destroy: () => undefined,
  };
  return { translator, asked };
}

async function translateAll(
  cueTranslator: CueTranslator,
  cues: readonly Cue[],
  options: { playheadMs?: number; signal?: AbortSignal } = {},
) {
  const updates: SubtitleTrack[] = [];
  await cueTranslator.translateTrack(cues, {
    playheadMs: () => options.playheadMs ?? 0,
    onUpdate: (track) => updates.push(track),
    signal: options.signal ?? new AbortController().signal,
  });
  return updates;
}

describe('CueTranslator', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.stubGlobal('indexedDB', new IDBFactory());
    serveTranslationCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds a Portuguese track with the times of the English cues', async () => {
    const { translator } = fakeTranslator();
    const updates = await translateAll(
      new CueTranslator(translator, EN_PT),
      cuesOf('Hello.', 'Bye.'),
    );

    const portuguese = updates.at(-1);
    expect(portuguese?.cues).toEqual([
      { id: 0, startMs: 0, endMs: 900, text: 'pt:Hello.', lang: 'pt' },
      { id: 1, startMs: 1000, endMs: 1900, text: 'pt:Bye.', lang: 'pt' },
    ]);
    expect(portuguese?.activeAt(1500).map((cue) => cue.text)).toEqual(['pt:Bye.']);
  });

  it('starts at the playhead, then goes back from the nearest cue', async () => {
    const { translator, asked } = fakeTranslator();
    await translateAll(new CueTranslator(translator, EN_PT), cuesOf('a', 'b', 'c', 'd', 'e'), {
      playheadMs: 2500,
    });
    expect(asked).toEqual(['c', 'd', 'e', 'b', 'a']);
  });

  it('follows the playhead between batches', async () => {
    const cues = cuesOf(...Array.from({ length: 30 }, (_, index) => `line ${String(index)}`));
    let playheadMs = 0;
    const { translator, asked } = fakeTranslator((text) => {
      if (text === 'line 19') playheadMs = 25_500;
    });
    await translateAll(new CueTranslator(translator, EN_PT), cues, {
      get playheadMs() {
        return playheadMs;
      },
    });
    expect(asked.slice(20, 24)).toEqual(['line 25', 'line 26', 'line 27', 'line 28']);
    expect(asked).toHaveLength(30);
  });

  it('shows each translation as soon as it is ready, without waiting for the batch', async () => {
    const { translator } = fakeTranslator();
    const cues = cuesOf(...Array.from({ length: 45 }, (_, index) => `line ${String(index)}`));
    const updates = await translateAll(new CueTranslator(translator, EN_PT), cues);
    expect(updates.map((track) => track.cues.length)).toEqual(
      Array.from({ length: 45 }, (_, index) => index + 1),
    );
  });

  it('uses saved translations without asking the translator', async () => {
    await saveTranslations(EN_PT, [{ text: 'Hello.', translation: 'Olá.' }]);
    const { translator, asked } = fakeTranslator();
    const updates = await translateAll(
      new CueTranslator(translator, EN_PT),
      cuesOf('Hello.', 'Bye.'),
    );

    expect(asked).toEqual(['Bye.']);
    expect(updates.map((track) => track.cues.map((cue) => cue.text))).toEqual([
      ['Olá.'],
      ['Olá.', 'pt:Bye.'],
    ]);
  });

  it('gives a shifted track the translations it already knows at once', async () => {
    const { translator } = fakeTranslator();
    const cueTranslator = new CueTranslator(translator, EN_PT);
    const cues = cuesOf('Hello.', 'Bye.');
    await translateAll(cueTranslator, cues);

    const updates: SubtitleTrack[] = [];
    const shifted = cues.map((cue) => ({
      ...cue,
      startMs: cue.startMs + 100,
      endMs: cue.endMs + 100,
    }));
    const done = cueTranslator.translateTrack(shifted, {
      playheadMs: () => 0,
      onUpdate: (track) => updates.push(track),
      signal: new AbortController().signal,
    });

    expect(updates.map((track) => track.cues.map((cue) => cue.startMs))).toEqual([[100, 1100]]);
    await done;
    expect(updates).toHaveLength(1);
  });

  it('saves new translations for the next time', async () => {
    const { translator } = fakeTranslator();
    await translateAll(new CueTranslator(translator, EN_PT), cuesOf('Hello.', 'Bye.'));
    expect(await findCachedTranslations(EN_PT, ['Hello.', 'Bye.'])).toEqual([
      'pt:Hello.',
      'pt:Bye.',
    ]);
  });

  it('translates a repeated cue only once', async () => {
    const { translator, asked } = fakeTranslator();
    const updates = await translateAll(
      new CueTranslator(translator, EN_PT),
      cuesOf('Yeah.', 'No.', 'Yeah.'),
    );
    expect(asked).toEqual(['Yeah.', 'No.']);
    expect(updates.at(-1)?.cues.map((cue) => cue.text)).toEqual(['pt:Yeah.', 'pt:No.', 'pt:Yeah.']);
  });

  it('stops quietly when the video changes and keeps what was already translated', async () => {
    const controller = new AbortController();
    const { translator, asked } = fakeTranslator((text) => {
      if (text === 'b') controller.abort();
    });
    const updates = await translateAll(
      new CueTranslator(translator, EN_PT),
      cuesOf('a', 'b', 'c'),
      { signal: controller.signal },
    );

    expect(asked).toEqual(['a', 'b']);
    expect(updates.map((track) => track.cues.map((cue) => cue.text))).toEqual([['pt:a']]);
    expect(await findCachedTranslations(EN_PT, ['a', 'b'])).toEqual(['pt:a', null]);
  });

  it('lets a translator failure reach the caller', async () => {
    const failing: Translator = {
      translate: () => Promise.reject(new Error('model crashed')),
      destroy: () => undefined,
    };
    await expect(translateAll(new CueTranslator(failing, EN_PT), cuesOf('Hello.'))).rejects.toThrow(
      'model crashed',
    );
  });

  it('translates each speaker of a dialogue on its own, since the translator joins the lines', async () => {
    const asked: string[] = [];
    const joiningTranslator: Translator = {
      translate: (text) => {
        asked.push(text);
        return Promise.resolve(`pt:${text.replace(/\s*\n\s*/g, ' ')}`);
      },
      destroy: () => undefined,
    };
    const cueTranslator = new CueTranslator(joiningTranslator, EN_PT);
    const updates = await translateAll(
      cueTranslator,
      cuesOf('- Where are you going?\n- Home.', 'Hello\nthere.'),
    );

    expect(updates.at(-1)?.cues.map((cue) => cue.text)).toEqual([
      'pt:- Where are you going?\npt:- Home.',
      'pt:Hello there.',
    ]);
    expect(asked).toEqual(['- Where are you going?', '- Home.', 'Hello\nthere.']);
    expect(await cueTranslator.translateLine('— Wait.\n— Go.', new AbortController().signal)).toBe(
      'pt:— Wait.\npt:— Go.',
    );
  });

  it('translates a line read from the screen once and remembers it', async () => {
    const { translator, asked } = fakeTranslator();
    const cueTranslator = new CueTranslator(translator, EN_PT);
    const signal = new AbortController().signal;

    expect(await cueTranslator.translateLine('so today we', signal)).toBe('pt:so today we');
    expect(await cueTranslator.translateLine('so today we', signal)).toBe('pt:so today we');
    expect(asked).toEqual(['so today we']);
    expect(await findCachedTranslations(EN_PT, ['so today we'])).toEqual([null]);
  });

  it('gives no line when the screen changed before the translation ended', async () => {
    const controller = new AbortController();
    const { translator } = fakeTranslator(() => {
      controller.abort();
    });
    expect(
      await new CueTranslator(translator, EN_PT).translateLine('hello', controller.signal),
    ).toBeNull();
  });
});
