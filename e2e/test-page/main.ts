import overlayCss from '../../src/overlay/subtitle-overlay.css?inline';
import { SubtitleOverlay, type TranslationState } from '../../src/overlay/subtitle-overlay';
import type { Cue } from '../../src/subtitles/cue';
import { SubtitleTrack } from '../../src/subtitles/subtitle-track';
import { parseWebVtt } from '../../src/subtitles/webvtt';

const video = document.querySelector('video');
const trackElement = document.querySelector('track');
const activeCueList = document.querySelector('#active-cues');
const player = document.querySelector('#player');
if (!video || !trackElement || !activeCueList || !player) {
  throw new Error('The test page markup is incomplete');
}

trackElement.track.mode = 'hidden';

async function loadTrack(url: string, lang: string): Promise<SubtitleTrack> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url}: ${String(response.status)}`);
  return new SubtitleTrack(parseWebVtt(await response.text(), lang));
}

const subtitleTrack = await loadTrack(trackElement.src, 'en');
const portugueseTrack = await loadTrack('subtitles.pt.vtt', 'pt');

const overlayHost = document.createElement('div');
const shadow = overlayHost.attachShadow({ mode: 'open' });
const style = document.createElement('style');
style.textContent = overlayCss;
const overlayContainer = document.createElement('div');
shadow.append(style, overlayContainer);
player.append(overlayHost);
const overlay = new SubtitleOverlay(overlayContainer);

const TRANSLATION_STATES: Record<string, TranslationState> = {
  'waiting-for-gesture': { kind: 'waiting-for-gesture' },
  downloading: { kind: 'downloading', progress: 0.4 },
  unsupported: { kind: 'unsupported' },
  'download-failed': { kind: 'download-failed' },
  'translation-failed': { kind: 'translation-failed' },
};
const translationState =
  TRANSLATION_STATES[new URLSearchParams(location.search).get('translation-state') ?? ''];
if (translationState) overlay.showTranslationState(translationState);
const portugueseCuesAt = (timeMs: number) =>
  translationState ? [] : portugueseTrack.activeAt(timeMs);

let shownCues: readonly Cue[] = [];
const renderActiveCues = (): void => {
  const timeMs = Math.round(video.currentTime * 1000);
  const activeCues = subtitleTrack.activeAt(timeMs);
  overlay.showCues(activeCues, portugueseCuesAt(timeMs));
  if (activeCues === shownCues) return;
  shownCues = activeCues;
  activeCueList.replaceChildren(
    ...activeCues.map((cue) => {
      const item = document.createElement('li');
      item.textContent = cue.text;
      return item;
    }),
  );
};
video.addEventListener('timeupdate', renderActiveCues);
video.addEventListener('seeked', renderActiveCues);

if (trackElement.readyState !== HTMLTrackElement.LOADED) {
  await new Promise((resolve) => {
    trackElement.addEventListener('load', resolve, { once: true });
  });
}
if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
  await new Promise((resolve) => {
    video.addEventListener('loadedmetadata', resolve, { once: true });
  });
}
renderActiveCues();
document.body.dataset.ready = 'true';
