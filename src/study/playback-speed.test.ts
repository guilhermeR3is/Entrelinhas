import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_SPEED, MIN_SPEED, PlaybackSpeed, stepSpeed } from './playback-speed';

class FakeVideo extends EventTarget {
  private rate = 1;

  get playbackRate(): number {
    return this.rate;
  }

  set playbackRate(rate: number) {
    if (rate === this.rate) return;
    this.rate = rate;
    setTimeout(() => this.dispatchEvent(new Event('ratechange')));
  }
  loadNextVideo(): void {
    this.rate = 1;
    setTimeout(() => {
      this.dispatchEvent(new Event('emptied'));
      this.dispatchEvent(new Event('loadstart'));
    });
  }
}

function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 5));
}

describe('stepSpeed', () => {
  it('moves in steps of 0.05', () => {
    expect(stepSpeed(1, -1)).toBe(0.95);
    expect(stepSpeed(1, 3)).toBe(1.15);
  });

  it('stays between 0.5 and 2', () => {
    expect(stepSpeed(MIN_SPEED, -1)).toBe(MIN_SPEED);
    expect(stepSpeed(MAX_SPEED, 1)).toBe(MAX_SPEED);
    expect(stepSpeed(0.25, 1)).toBe(MIN_SPEED);
  });

  it('lands on exact hundredths after many steps', () => {
    let speed = MIN_SPEED;
    const seen: number[] = [];
    for (let i = 0; i < 30; i++) {
      speed = stepSpeed(speed, 1);
      seen.push(speed);
    }
    expect(speed).toBe(MAX_SPEED);
    for (const value of seen) expect(value).toBe(Math.round(value * 100) / 100);
  });
});

describe('PlaybackSpeed', () => {
  let video: FakeVideo;
  let clockMs: number;
  let personChangedSpeed: boolean;
  const onChange = vi.fn();
  const onPersonChoice = vi.fn();

  function createSpeed(): PlaybackSpeed {
    return new PlaybackSpeed(video, {
      onChange,
      onPersonChoice,
      personChangedSpeed: () => personChangedSpeed,
      now: () => clockMs,
    });
  }

  beforeEach(() => {
    video = new FakeVideo();
    clockMs = 0;
    personChangedSpeed = false;
    onChange.mockClear();
    onPersonChoice.mockClear();
  });

  it('starts from the speed the video already has', () => {
    video.playbackRate = 1.25;
    expect(createSpeed().speed).toBe(1.25);
  });

  it('applies each step to the video and reports it', async () => {
    const speed = createSpeed();
    speed.step(-5);
    await settle();
    expect(video.playbackRate).toBe(0.75);
    expect(speed.speed).toBe(0.75);
    expect(onChange).toHaveBeenCalledExactlyOnceWith(0.75);
  });

  it('puts the chosen speed back when the player resets it on its own', async () => {
    const speed = createSpeed();
    speed.step(-5);
    await settle();
    video.playbackRate = 1;
    await settle();
    expect(video.playbackRate).toBe(0.75);
    expect(speed.speed).toBe(0.75);
    expect(onChange).toHaveBeenCalledOnce();
  });

  it('puts the chosen speed back when the video loads the next one without a ratechange', async () => {
    const speed = createSpeed();
    speed.step(-5);
    await settle();
    video.loadNextVideo();
    await settle();
    expect(video.playbackRate).toBe(0.75);
    expect(speed.speed).toBe(0.75);
  });

  it('leaves a new video at normal speed while held', async () => {
    const speed = createSpeed();
    speed.step(-5);
    speed.setHeld(true);
    await settle();
    video.loadNextVideo();
    await settle();
    expect(video.playbackRate).toBe(1);
  });

  it('keeps the speed the person picked in the player menu', async () => {
    const speed = createSpeed();
    speed.step(-5);
    await settle();
    personChangedSpeed = true;
    video.playbackRate = 1.5;
    await settle();
    expect(video.playbackRate).toBe(1.5);
    expect(speed.speed).toBe(1.5);
    expect(onChange).toHaveBeenLastCalledWith(1.5);
    expect(onPersonChoice).toHaveBeenCalledExactlyOnceWith(1.5);
  });

  it('gives up when the player undoes the speed three times within two seconds', async () => {
    const speed = createSpeed();
    speed.step(-5);
    await settle();
    for (let undo = 0; undo < 3; undo++) {
      clockMs += 500;
      video.playbackRate = 1;
      await settle();
    }
    expect(video.playbackRate).toBe(1);
    expect(speed.speed).toBe(1);
    expect(onChange).toHaveBeenLastCalledWith(1);
    expect(onPersonChoice).not.toHaveBeenCalled();
  });

  it('keeps putting the speed back when the resets are far apart', async () => {
    const speed = createSpeed();
    speed.step(-5);
    await settle();
    for (let undo = 0; undo < 5; undo++) {
      clockMs += 1500;
      video.playbackRate = 1;
      await settle();
    }
    expect(video.playbackRate).toBe(0.75);
    expect(speed.speed).toBe(0.75);
  });

  it('plays at normal speed while held, ignores the player and restores the speed when released', async () => {
    const speed = createSpeed();
    speed.step(-5);
    await settle();
    speed.setHeld(true);
    await settle();
    expect(video.playbackRate).toBe(1);

    video.playbackRate = 1.5;
    await settle();
    expect(video.playbackRate).toBe(1.5);

    speed.setHeld(false);
    await settle();
    expect(video.playbackRate).toBe(0.75);
    expect(speed.speed).toBe(0.75);
  });

  it('remembers a speed chosen while held and applies it on release', async () => {
    const speed = createSpeed();
    speed.setHeld(true);
    speed.step(2);
    await settle();
    expect(video.playbackRate).toBe(1);
    expect(onChange).toHaveBeenCalledExactlyOnceWith(1.1);

    speed.setHeld(false);
    await settle();
    expect(video.playbackRate).toBe(1.1);
  });

  it('stops following the video after stop', async () => {
    const speed = createSpeed();
    speed.step(-5);
    await settle();
    speed.stop();
    video.playbackRate = 1;
    await settle();
    expect(video.playbackRate).toBe(1);
  });
});
