import { logger } from '../logger';
import type { CaptionTrackMessage } from './caption-track-message';

type CaptureTarget = Pick<Window, 'location' | 'postMessage'> & {
  XMLHttpRequest: typeof XMLHttpRequest;
};

const CAPTION_PATH = '/api/timedtext';

export function captureCaptionTracks(target: CaptureTarget): void {
  const prototype = target.XMLHttpRequest.prototype;
  const originalOpen: unknown = Reflect.get(prototype, 'open');
  if (typeof originalOpen !== 'function') return;

  prototype.open = function open(
    this: XMLHttpRequest,
    method: string,
    url: string | URL,
    ...rest: unknown[]
  ): void {
    Reflect.apply(originalOpen, this, [method, url, ...rest]);
    const captionUrl = URL.parse(String(url), target.location.href);
    if (captionUrl?.pathname !== CAPTION_PATH) return;

    this.addEventListener('load', () => {
      try {
        forwardCaptionTrack(this, captionUrl, target);
      } catch (error) {
        logger.error('Could not forward the YouTube caption track', error);
      }
    });
  };
}

function forwardCaptionTrack(request: XMLHttpRequest, url: URL, target: CaptureTarget): void {
  const videoId = url.searchParams.get('v');
  if (request.status !== 200 || !videoId) return;

  const message: CaptionTrackMessage = {
    source: 'projeto-bilingue:caption-track',
    videoId,
    lang: url.searchParams.get('lang'),
    kind: url.searchParams.get('kind'),
    translatedTo: url.searchParams.get('tlang'),
    body: readBody(request),
  };
  target.postMessage(message, target.location.origin);
}

function readBody(request: XMLHttpRequest): string {
  switch (request.responseType) {
    case '':
    case 'text':
      return request.responseText;
    case 'json':
      return JSON.stringify(request.response);
    default:
      throw new Error(`Unexpected caption response type: ${request.responseType}`);
  }
}
