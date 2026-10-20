import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type PreferenceStorage, StudyPreferenceStore } from '../study/study-preferences';
import type { CaptionStatus } from '../subtitles/caption-status';
import { SubtitleTrack } from '../subtitles/subtitle-track';
import { PortugueseTranslation } from '../translation/portuguese-translation';
import type { PlayerAdapter, PlayerEvents } from './player-adapter';
import { SubtitleSession } from './subtitle-session';

const ENGLISH = new SubtitleTrack([
  { id: 0, startMs: 1000, endMs: 3000, text: 'Hello there.', lang: 'en' },
]);

class FakePlayer implements PlayerAdapter {
  currentStatus: CaptionStatus = 'full-track';
  showingAd = false;
  key: string | null = 'lesson-1';
  siteCaptionsHidden: boolean | null = null;
  events: PlayerEvents | null = null;
  stopped = false;

  constructor(readonly player: Element) {}

  start(events: PlayerEvents): void {
    this.events = events;
  }
  stop(): void {
    this.stopped = true;
  }
  video(): HTMLVideoElement | null {
    return this.player.querySelector('video');
  }
  videoKey(): string | null {
    return this.key;
  }
  isShowingAd(): boolean {
    return this.showingAd;
  }
  personChangedSpeed(): boolean {
    return false;
  }
  status(): CaptionStatus {
    return this.currentStatus;
  }
  activeCues(timeMs: number) {
    return this.currentStatus === 'full-track' ? ENGLISH.activeAt(timeMs) : [];
  }
  englishTrack(): SubtitleTrack | null {
    return this.currentStatus === 'full-track' ? ENGLISH : null;
  }
  officialPortugueseTrack(): SubtitleTrack | null {
    return null;
  }
  hideSiteCaptions(hidden: boolean): void {
    this.siteCaptionsHidden = hidden;
  }
}

describe('SubtitleSession with any player adapter', () => {
  let document: Document;
  let adapter: FakePlayer;
  let session: SubtitleSession;
  const playback = { currentTime: 0, paused: true };

  beforeEach(async () => {
    const { window } = new JSDOM('<div id="player"><video></video></div><div id="overlay"></div>');
    document = window.document;
    vi.stubGlobal('MutationObserver', window.MutationObserver);
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe = vi.fn();
      },
    );
    vi.stubGlobal('AbortController', window.AbortController);
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    const video = find('video');
    Object.assign(playback, { currentTime: 1.5, paused: true });
    Object.defineProperty(video, 'currentTime', { get: () => playback.currentTime });
    Object.defineProperty(video, 'paused', { get: () => playback.paused });

    const storage = {
      get: () => Promise.resolve({}),
      set: () => Promise.resolve(),
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    };
    const preferences = await StudyPreferenceStore.load(storage as unknown as PreferenceStorage);
    adapter = new FakePlayer(find('#player'));
    session = new SubtitleSession(
      find('#overlay'),
      adapter,
      new PortugueseTranslation(() => undefined),
      preferences,
    );
  });

  afterEach(() => {
    session.stop();
    vi.unstubAllGlobals();
  });

  function find(selector: string): HTMLElement {
    const element = document.querySelector<HTMLElement>(selector);
    if (!element) throw new Error(`Missing ${selector}`);
    return element;
  }

  function englishText(): string | null {
    return find('.subtitle').hidden ? null : find('.english').textContent;
  }

  it('draws the cue the adapter gives and hides the site captions meanwhile', () => {
    expect(englishText()).toBe('Hello there.');
    expect(adapter.siteCaptionsHidden).toBe(true);
  });

  it('draws again when the adapter says the captions changed', () => {
    adapter.currentStatus = 'waiting';
    adapter.events?.onCaptionsChange();
    expect(englishText()).toBeNull();
    expect(adapter.siteCaptionsHidden).toBe(false);
  });

  it('steps aside while the adapter reports an ad', () => {
    adapter.showingAd = true;
    session.render();
    expect(englishText()).toBeNull();
    expect(adapter.siteCaptionsHidden).toBe(false);
    expect(session.handleCommand('slower')).toBe(false);
  });

  it('gives no notice for a video without a key', () => {
    vi.useFakeTimers();
    adapter.currentStatus = 'waiting';
    adapter.key = null;
    playback.paused = false;
    for (playback.currentTime = 0; playback.currentTime < 5; playback.currentTime += 0.5) {
      session.render();
    }
    vi.useRealTimers();
    expect(find('.status').textContent).toBe('');
  });

  it('stops the adapter with the session', () => {
    session.stop();
    expect(adapter.stopped).toBe(true);
  });
});
