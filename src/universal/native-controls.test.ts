import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  NATIVE_CONTROLS_HIDE_MS,
  NATIVE_CONTROLS_PX,
  watchNativeControls,
} from './native-controls';

let window: JSDOM['window'];
let video: HTMLVideoElement;
let paused: boolean;
let onLift: ReturnType<typeof vi.fn<(liftPx: number) => void>>;
let stop: () => void;

beforeEach(() => {
  vi.useFakeTimers();
  window = new JSDOM('<video controls></video><p>outside</p>').window;
  vi.stubGlobal('AbortController', window.AbortController);
  const found = window.document.querySelector('video');
  if (!found) throw new Error('Missing video');
  video = found;
  paused = true;
  Object.defineProperty(video, 'paused', { get: () => paused });
  video.getBoundingClientRect = () => ({ left: 0, top: 0, right: 480, bottom: 270 }) as DOMRect;
  onLift = vi.fn<(liftPx: number) => void>();
  stop = watchNativeControls(video, onLift);
});

afterEach(() => {
  stop();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function play(): void {
  paused = false;
  video.dispatchEvent(new window.Event('play'));
}

function movePointer(clientX: number, clientY: number): void {
  const event = new window.MouseEvent('pointermove', { clientX, clientY, bubbles: true });
  window.document.body.dispatchEvent(event);
}

function lastLift(): number | undefined {
  return onLift.mock.lastCall?.[0];
}

it('lifts the caption over the bar while the video is paused', () => {
  expect(lastLift()).toBe(NATIVE_CONTROLS_PX);
});

it('lets the caption down when the video plays with the pointer away', () => {
  play();
  expect(lastLift()).toBe(0);
});

it('lifts it while the pointer moves over the playing video, until the bar hides', () => {
  play();
  movePointer(200, 100);
  expect(lastLift()).toBe(NATIVE_CONTROLS_PX);

  vi.advanceTimersByTime(NATIVE_CONTROLS_HIDE_MS - 100);
  movePointer(210, 110);
  vi.advanceTimersByTime(NATIVE_CONTROLS_HIDE_MS - 100);
  expect(lastLift()).toBe(NATIVE_CONTROLS_PX);

  vi.advanceTimersByTime(200);
  expect(lastLift()).toBe(0);
});

it('lets it down as soon as the pointer moves out of the video', () => {
  play();
  movePointer(200, 100);
  movePointer(600, 400);
  expect(lastLift()).toBe(0);
});

it('lets it down when the pointer leaves the page', () => {
  play();
  movePointer(200, 100);
  window.document.documentElement.dispatchEvent(new window.Event('pointerleave'));
  expect(lastLift()).toBe(0);
});

it('never lifts it for a video without the native bar', () => {
  stop();
  video.controls = false;
  onLift.mockClear();
  stop = watchNativeControls(video, onLift);
  movePointer(200, 100);
  expect(onLift.mock.calls.every(([lift]) => lift === 0)).toBe(true);
});

it('tells only the changes', () => {
  play();
  movePointer(200, 100);
  movePointer(210, 100);
  movePointer(220, 100);
  expect(onLift.mock.calls.map(([lift]) => lift)).toEqual([
    NATIVE_CONTROLS_PX,
    0,
    NATIVE_CONTROLS_PX,
  ]);
});

it('stops following the pointer when it is stopped', () => {
  play();
  stop();
  onLift.mockClear();
  movePointer(200, 100);
  expect(onLift).not.toHaveBeenCalled();
});

it('does not measure the video on every pointer move while it has no bar', () => {
  video.controls = false;
  const measure = vi.spyOn(video, 'getBoundingClientRect');
  play();
  movePointer(200, 100);
  movePointer(210, 110);
  expect(measure).not.toHaveBeenCalled();
  expect(lastLift()).toBe(0);

  video.controls = true;
  movePointer(220, 120);
  expect(measure).toHaveBeenCalledTimes(1);
  expect(lastLift()).toBe(NATIVE_CONTROLS_PX);
});
