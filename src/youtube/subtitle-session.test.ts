import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SubtitleSession } from './subtitle-session';
import { YouTubeAdapter } from './youtube-adapter';

const TRACK_BODY = JSON.stringify({
  events: [{ tStartMs: 1000, dDurationMs: 2000, segs: [{ utf8: 'Hello there' }] }],
});

const PLAYER_HTML = `
  <div id="movie_player">
    <video></video>
    <div id="ytp-caption-window-container"></div>
  </div>
  <div id="overlay"></div>`;

describe('SubtitleSession', () => {
  let document: Document;
  let page: { location: Location };
  let adapter: YouTubeAdapter;
  let video: HTMLVideoElement;
  let frames: FrameRequestCallback[];
  let session: SubtitleSession | undefined;
  const playback = { currentTime: 0, paused: true };

  beforeEach(() => {
    const { window } = new JSDOM(PLAYER_HTML);
    document = window.document;
    vi.stubGlobal('MutationObserver', window.MutationObserver);
    vi.stubGlobal('AbortController', window.AbortController);
    frames = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {
      frames = [];
    });

    const videoElement = document.querySelector('video');
    if (!videoElement) throw new Error('Missing video');
    video = videoElement;
    Object.assign(playback, { currentTime: 0, paused: true });
    Object.defineProperty(video, 'currentTime', { get: () => playback.currentTime });
    Object.defineProperty(video, 'paused', { get: () => playback.paused });

    page = { location: { href: 'https://www.youtube.com/watch?v=video-a' } as Location };
    adapter = new YouTubeAdapter(page);
  });

  afterEach(() => {
    session?.stop();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function find(selector: string): HTMLElement {
    const element = document.querySelector<HTMLElement>(selector);
    if (!element) throw new Error(`Missing ${selector}`);
    return element;
  }

  function emit(type: string): void {
    const view = document.defaultView;
    if (!view) throw new Error('Missing window');
    video.dispatchEvent(new view.Event(type));
  }

  function start(): SubtitleSession {
    session = new SubtitleSession(find('#overlay'), find('#movie_player'), adapter);
    return session;
  }

  function receiveTrack(lang = 'en'): void {
    adapter.receive({
      source: page as unknown as MessageEventSource,
      data: {
        source: 'projeto-bilingue:caption-track',
        videoId: 'video-a',
        lang,
        kind: null,
        translatedTo: null,
        body: TRACK_BODY,
      },
    });
  }

  function playUntil(seconds: number): void {
    playback.paused = false;
    emit('playing');
    for (let time = playback.currentTime; time <= seconds; time += 0.25) {
      playback.currentTime = time;
      const pending = frames;
      frames = [];
      for (const frame of pending) frame(0);
    }
  }

  function englishText(): string | null {
    const subtitle = find('.subtitle');
    return subtitle.hidden ? null : find('.english').textContent;
  }

  it('shows the cue for a paused video and follows a seek', () => {
    receiveTrack();
    start();
    expect(englishText()).toBeNull();

    playback.currentTime = 1.5;
    emit('seeked');
    expect(englishText()).toBe('Hello there');
  });

  it('follows the video frame by frame while it plays and stops when paused', () => {
    receiveTrack();
    start();
    playUntil(1.5);
    expect(englishText()).toBe('Hello there');
    expect(frames).toHaveLength(1);

    playback.paused = true;
    const pending = frames;
    frames = [];
    for (const frame of pending) frame(0);
    expect(frames).toHaveLength(0);
  });

  it('hides the original captions only while the extension shows its own', () => {
    start();
    const nativeCaptions = find('#ytp-caption-window-container');
    expect(nativeCaptions.style.visibility).toBe('');

    receiveTrack();
    session?.render();
    expect(nativeCaptions.style.visibility).toBe('hidden');

    session?.stop();
    expect(nativeCaptions.style.visibility).toBe('');
  });

  function replaceNativeCaptions(): HTMLElement {
    const newCaptions = document.createElement('div');
    newCaptions.id = 'ytp-caption-window-container';
    find('#ytp-caption-window-container').replaceWith(newCaptions);
    return newCaptions;
  }

  it('hides the new captions container when the player replaces it', () => {
    start();
    const newCaptions = replaceNativeCaptions();
    receiveTrack();
    session?.render();
    expect(newCaptions.style.visibility).toBe('hidden');
  });

  it('reads the screen from the new captions container while the video plays', async () => {
    start();
    const newCaptions = replaceNativeCaptions();
    playUntil(0.5);
    newCaptions.innerHTML = '<span class="caption-visual-line">Read from the new container</span>';
    await new Promise((resolve) => setTimeout(resolve));
    expect(englishText()).toBe('Read from the new container');
  });

  it('keeps the original captions visible when they are in another language', () => {
    receiveTrack('pt');
    start();
    expect(find('#ytp-caption-window-container').style.visibility).toBe('');
  });

  it('reads the captions on screen when no track was captured', async () => {
    start();
    find('#ytp-caption-window-container').innerHTML =
      '<span class="caption-visual-line">Hello from the screen</span>';
    await new Promise((resolve) => setTimeout(resolve));
    expect(englishText()).toBe('Hello from the screen');
  });

  it('asks to turn captions on after two seconds of playback, only once', () => {
    start();
    playUntil(1.75);
    expect(find('.status').textContent).toBe('');

    playUntil(2.25);
    expect(find('.status .word-class').textContent).toBe('desligada');

    session?.render();
    find('.status').replaceChildren();
    playUntil(6);
    expect(find('.status').textContent).toBe('');
  });

  it('warns about captions in another language', () => {
    receiveTrack('pt');
    start();
    playUntil(2.5);
    expect(find('.status .word-class').textContent).toBe('outro idioma');
  });

  it('shows no cue and no notice while an ad plays, and comes back after it', () => {
    receiveTrack();
    start();
    find('#movie_player').classList.add('ad-showing');
    playUntil(2.5);
    expect(englishText()).toBeNull();
    expect(find('.status').textContent).toBe('');
    expect(find('#ytp-caption-window-container').style.visibility).toBe('');

    find('#movie_player').classList.remove('ad-showing');
    playback.currentTime = 1.5;
    session?.render();
    expect(englishText()).toBe('Hello there');
  });

  it('stays quiet outside a watch page', () => {
    page.location.href = 'https://www.youtube.com/';
    start();
    playUntil(5);
    expect(find('.status').textContent).toBe('');
  });

  it('stops listening to the video once stopped', () => {
    receiveTrack();
    start().stop();
    playUntil(1.5);
    expect(englishText()).toBeNull();
  });
});
