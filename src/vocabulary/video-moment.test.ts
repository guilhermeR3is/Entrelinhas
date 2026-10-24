import { describe, expect, it } from 'vitest';
import { formatVideoTime, isWebLink, videoLinkAt } from './video-moment';

describe('formatVideoTime', () => {
  it('writes minutes and seconds, and hours only when there are any', () => {
    expect(formatVideoTime(0)).toBe('0:00');
    expect(formatVideoTime(83_999)).toBe('1:23');
    expect(formatVideoTime(3_723_000)).toBe('1:02:03');
  });
});

describe('videoLinkAt', () => {
  it('points a YouTube video at the moment the word was said', () => {
    expect(videoLinkAt('https://www.youtube.com/watch?v=abc&t=10s', 83_999)).toBe(
      'https://www.youtube.com/watch?v=abc&t=83s',
    );
  });

  it('keeps the address of other pages as it is', () => {
    expect(videoLinkAt('https://cursos.example/aula/3?x=1', 83_999)).toBe(
      'https://cursos.example/aula/3?x=1',
    );
    expect(videoLinkAt('https://www.youtube.com/shorts/abc', 5000)).toBe(
      'https://www.youtube.com/shorts/abc',
    );
    expect(videoLinkAt('not a url', 0)).toBe('not a url');
  });
});

describe('isWebLink', () => {
  it('accepts only http and https addresses', () => {
    expect(isWebLink('https://a.example')).toBe(true);
    expect(isWebLink('HTTP://a.example')).toBe(true);
    expect(isWebLink('javascript:alert(1)')).toBe(false);
  });
});
