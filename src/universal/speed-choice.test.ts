import { beforeEach, expect, it } from 'vitest';
import { AFTER_LOAD_MS, SpeedChoice } from './speed-choice';

let video: HTMLVideoElement;
let activation: { isActive: boolean };
let nowMs: number;
let choice: SpeedChoice;

beforeEach(() => {
  video = new EventTarget() as HTMLVideoElement;
  activation = { isActive: false };
  nowMs = 10_000;
  choice = new SpeedChoice(video, activation, () => nowMs);
});

it('takes a change made while the person is interacting with the page as their choice', () => {
  activation.isActive = true;
  expect(choice.personChangedSpeed()).toBe(true);
});

it('takes a change without any interaction as the site resetting the speed', () => {
  expect(choice.personChangedSpeed()).toBe(false);
});

it('takes a change right after a new video starts loading as the site resetting it', () => {
  activation.isActive = true;
  video.dispatchEvent(new Event('loadstart'));
  nowMs += AFTER_LOAD_MS - 1;
  expect(choice.personChangedSpeed()).toBe(false);

  nowMs += 1;
  expect(choice.personChangedSpeed()).toBe(true);
});

it('also counts an emptied video as a new load', () => {
  activation.isActive = true;
  video.dispatchEvent(new Event('emptied'));
  expect(choice.personChangedSpeed()).toBe(false);
});

it('works where the browser does not tell about the interaction', () => {
  expect(new SpeedChoice(video, undefined).personChangedSpeed()).toBe(false);
});

it('stops following the loads when stopped', () => {
  activation.isActive = true;
  choice.stop();
  video.dispatchEvent(new Event('loadstart'));
  expect(choice.personChangedSpeed()).toBe(true);
});
