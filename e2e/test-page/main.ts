import type { Cue } from '../../src/subtitles/cue';
import { SubtitleTrack } from '../../src/subtitles/subtitle-track';
import { parseWebVtt } from '../../src/subtitles/webvtt';

const video = document.querySelector('video');
const trackElement = document.querySelector('track');
const activeCueList = document.querySelector('#active-cues');
if (!video || !trackElement || !activeCueList) {
  throw new Error('The test page markup is incomplete');
}

trackElement.track.mode = 'hidden';

const response = await fetch(trackElement.src);
if (!response.ok) throw new Error(`Could not load ${trackElement.src}: ${String(response.status)}`);
const subtitleTrack = new SubtitleTrack(parseWebVtt(await response.text(), 'en'));

let shownCues: readonly Cue[] = [];
const renderActiveCues = (): void => {
  const activeCues = subtitleTrack.activeAt(Math.round(video.currentTime * 1000));
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
