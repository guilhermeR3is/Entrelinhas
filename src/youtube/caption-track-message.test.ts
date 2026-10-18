import { describe, expect, it } from 'vitest';
import { readCaptionTrackMessage } from './caption-track-message';

const message = {
  source: 'projeto-bilingue:caption-track',
  videoId: 'abc123',
  lang: 'en',
  kind: null,
  translatedTo: null,
  body: '{"events":[]}',
};

describe('readCaptionTrackMessage', () => {
  it('accepts a caption track sent by the capture script', () => {
    expect(readCaptionTrackMessage(message)).toEqual(message);
  });

  it.each([
    ['a message from another script', { ...message, source: 'someone-else' }],
    ['a message without video id', { ...message, videoId: '' }],
    ['a message without body', { ...message, body: undefined }],
    ['a language that is not text', { ...message, lang: 1 }],
    ['an empty message', null],
    ['a plain string', 'caption-track'],
  ])('rejects %s', (_, data) => {
    expect(readCaptionTrackMessage(data)).toBeNull();
  });
});
