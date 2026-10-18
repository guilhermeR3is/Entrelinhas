import { describe, expect, it, vi } from 'vitest';
import { captureCaptionTracks } from './caption-capture';
import { readCaptionTrackMessage } from './caption-track-message';

const CAPTION_URL = 'https://www.youtube.com/api/timedtext?v=abc123&lang=en&kind=asr&pot=secret';

class FakeRequest extends EventTarget {
  status = 0;
  responseType: XMLHttpRequestResponseType = '';
  responseText = '';
  response: unknown = null;
  readonly openCalls: unknown[][] = [];

  open(...args: unknown[]): void {
    this.openCalls.push(args);
  }

  respond(status: number, body: string): void {
    this.status = status;
    this.responseText = body;
    this.response = this.responseType === 'json' ? JSON.parse(body) : body;
    this.dispatchEvent(new Event('load'));
  }
}

function createPage() {
  const Request = class extends FakeRequest {};
  const postMessage = vi.fn();
  const target = {
    XMLHttpRequest: Request,
    location: new URL('https://www.youtube.com/watch?v=abc123'),
    postMessage,
  } as unknown as Parameters<typeof captureCaptionTracks>[0];
  captureCaptionTracks(target);
  return { request: new Request(), postMessage };
}

describe('captureCaptionTracks', () => {
  it('forwards the caption track the player downloaded to the extension', () => {
    const { request, postMessage } = createPage();
    request.open('GET', CAPTION_URL);
    request.respond(200, '{"events":[]}');

    expect(postMessage).toHaveBeenCalledExactlyOnceWith(
      {
        source: 'projeto-bilingue:caption-track',
        videoId: 'abc123',
        lang: 'en',
        kind: 'asr',
        translatedTo: null,
        body: '{"events":[]}',
      },
      'https://www.youtube.com',
    );
  });

  it('sends a message that the extension side accepts, without the player token', () => {
    const { request, postMessage } = createPage();
    request.open('GET', `${CAPTION_URL}&tlang=pt`);
    request.respond(200, '{"events":[]}');

    const message: unknown = postMessage.mock.calls[0]?.[0];
    expect(readCaptionTrackMessage(message)).toMatchObject({ translatedTo: 'pt' });
    expect(JSON.stringify(message)).not.toContain('secret');
  });

  it('resolves caption addresses relative to the page', () => {
    const { request, postMessage } = createPage();
    request.open('GET', '/api/timedtext?v=abc123');
    request.respond(200, '{}');
    expect(postMessage).toHaveBeenCalledOnce();
  });

  it('ignores requests that are not caption tracks', () => {
    const { request, postMessage } = createPage();
    request.open('POST', 'https://www.youtube.com/youtubei/v1/player?v=abc123');
    request.respond(200, '{}');
    expect(postMessage).not.toHaveBeenCalled();
  });

  it.each([
    ['a failed response', CAPTION_URL, 429],
    ['a track without video id', 'https://www.youtube.com/api/timedtext?lang=en', 200],
  ])('ignores %s', (_, url, status) => {
    const { request, postMessage } = createPage();
    request.open('GET', url);
    request.respond(status, '{}');
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('keeps the original request and response untouched for the player', () => {
    const { request } = createPage();
    const playerListener = vi.fn();
    request.addEventListener('load', playerListener);
    request.open('GET', CAPTION_URL, true, 'user', 'password');
    request.respond(200, '{"events":[]}');

    expect(request.openCalls).toEqual([['GET', CAPTION_URL, true, 'user', 'password']]);
    expect(playerListener).toHaveBeenCalledOnce();
    expect(request.responseText).toBe('{"events":[]}');
  });

  it('forwards JSON responses as text', () => {
    const { request, postMessage } = createPage();
    request.responseType = 'json';
    request.open('GET', CAPTION_URL);
    request.respond(200, '{ "events": [] }');
    expect(postMessage.mock.calls[0]?.[0]).toMatchObject({ body: '{"events":[]}' });
  });

  it('never breaks the player when the response cannot be read', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { request, postMessage } = createPage();
    const playerListener = vi.fn();
    request.responseType = 'arraybuffer';
    request.open('GET', CAPTION_URL);
    request.addEventListener('load', playerListener);

    expect(() => {
      request.respond(200, '{}');
    }).not.toThrow();
    expect(playerListener).toHaveBeenCalledOnce();
    expect(postMessage).not.toHaveBeenCalled();
  });
});
