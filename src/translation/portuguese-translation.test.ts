import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { TranslationState } from '../overlay/subtitle-overlay';
import type { Cue } from '../subtitles/cue';
import { SubtitleTrack } from '../subtitles/subtitle-track';
import { PortugueseTranslation } from './portuguese-translation';
import { serveTranslationCache } from './translation-service';
import type { Translator, TranslatorApi, TranslatorAvailability } from './translator-api';

function trackOf(...texts: string[]): SubtitleTrack {
  const cues: Cue[] = texts.map((text, index) => ({
    id: index,
    startMs: index * 1000,
    endMs: index * 1000 + 900,
    text,
    lang: 'en',
  }));
  return new SubtitleTrack(cues);
}

function fakeApi(
  availability: TranslatorAvailability,
  translate: Translator['translate'] = (text) => Promise.resolve(`pt:${text}`),
): TranslatorApi {
  return {
    availability: () => Promise.resolve(availability),
    create: () => Promise.resolve({ translate, destroy: () => undefined }),
  };
}

function textsOf(cues: readonly Cue[]): string[] {
  return cues.map((cue) => cue.text);
}

async function settle() {
  for (let round = 0; round < 20; round += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

describe('PortugueseTranslation', () => {
  let changes: number;
  let translation: PortugueseTranslation;
  const page = new EventTarget();

  beforeEach(() => {
    fakeBrowser.reset();
    vi.stubGlobal('indexedDB', new IDBFactory());
    serveTranslationCache();
    changes = 0;
    translation = new PortugueseTranslation(() => {
      changes += 1;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('translates the English track into sentences timed like the English', async () => {
    await translation.prepare(fakeApi('available'), page, new AbortController().signal);
    const english = trackOf('So I wrote', 'a thesis.', 'Bye.');

    expect(translation.cuesFor(english, 0)).toEqual([]);
    await settle();
    expect(textsOf(translation.cuesFor(english, 500))).toEqual(['pt:So I wrote a thesis.']);
    expect(textsOf(translation.cuesFor(english, 1500))).toEqual(['pt:So I wrote a thesis.']);
    expect(textsOf(translation.cuesFor(english, 2500))).toEqual(['pt:Bye.']);
    expect(translation.state()).toBeNull();
    expect(changes).toBeGreaterThan(0);
  });

  it('starts over for the track of a new video and drops the old one', async () => {
    await translation.prepare(fakeApi('available'), page, new AbortController().signal);
    const first = trackOf('Hello.');
    const second = trackOf('Goodbye.');

    translation.cuesFor(first, 0);
    translation.cuesFor(second, 0);
    await settle();
    expect(textsOf(translation.cuesFor(second, 500))).toEqual(['pt:Goodbye.']);
  });

  it('waits for the translator and then translates the track it was asked for', async () => {
    const english = trackOf('Hello.');
    expect(translation.cuesFor(english, 0)).toEqual([]);

    await translation.prepare(fakeApi('available'), page, new AbortController().signal);
    translation.cuesFor(english, 0);
    await settle();
    expect(textsOf(translation.cuesFor(english, 500))).toEqual(['pt:Hello.']);
  });

  it('reports the translator states for the overlay', async () => {
    const states: (TranslationState | null)[] = [];
    translation = new PortugueseTranslation(() => states.push(translation.state()));
    await translation.prepare(null, page, new AbortController().signal);
    expect(states).toEqual([{ kind: 'unsupported' }]);
  });

  it('asks for the first click while the model still has to be downloaded', async () => {
    void translation.prepare(fakeApi('downloadable'), page, new AbortController().signal);
    await settle();
    expect(translation.state()).toEqual({ kind: 'waiting-for-gesture' });
  });

  it('turns a failed download into the download notice', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const api: TranslatorApi = {
      availability: () => Promise.resolve('available'),
      create: () => Promise.reject(new Error('network down')),
    };
    await translation.prepare(api, page, new AbortController().signal);
    expect(translation.state()).toEqual({ kind: 'download-failed' });
  });

  it('reports a track that could not be translated and clears it for the next video', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let broken = true;
    await translation.prepare(
      fakeApi('available', (text) =>
        broken ? Promise.reject(new Error('model crashed')) : Promise.resolve(`pt:${text}`),
      ),
      page,
      new AbortController().signal,
    );

    translation.cuesFor(trackOf('Hello.'), 0);
    await settle();
    expect(translation.state()).toEqual({ kind: 'translation-failed' });
    expect(consoleError).toHaveBeenCalledOnce();

    broken = false;
    translation.cuesFor(trackOf('Next video.'), 0);
    expect(translation.state()).toBeNull();
  });

  it('translates the line read from the screen and keeps the same answer for the same line', async () => {
    await translation.prepare(fakeApi('available'), page, new AbortController().signal);

    expect(translation.lineFor('so today we')).toEqual([]);
    await settle();
    const line = translation.lineFor('so today we');
    expect(textsOf(line)).toEqual(['pt:so today we']);
    expect(translation.lineFor('so today we')).toBe(line);
  });

  it('forgets a line that left the screen before its translation arrived', async () => {
    await translation.prepare(fakeApi('available'), page, new AbortController().signal);
    translation.lineFor('so today');
    translation.lineFor('so today we');
    await settle();
    expect(textsOf(translation.lineFor('so today we'))).toEqual(['pt:so today we']);
    expect(translation.lineFor('')).toEqual([]);
  });

  it('translates a screen line that appeared before the translator was ready', async () => {
    expect(translation.lineFor('hello')).toEqual([]);
    await translation.prepare(fakeApi('available'), page, new AbortController().signal);
    translation.lineFor('hello');
    await settle();
    expect(textsOf(translation.lineFor('hello'))).toEqual(['pt:hello']);
  });
});
