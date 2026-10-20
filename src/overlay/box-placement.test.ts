import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PLACEMENT,
  offsetFor,
  placementAt,
  toggledEdge,
  topOf,
  type BoxPlacement,
} from './box-placement';

const PLAYER = { width: 1000, height: 500 };
const BOX = { width: 200, height: 60 };

describe('offsetFor', () => {
  it('starts centred, with the bottom of the box 4% above the bottom of the video', () => {
    expect(offsetFor(DEFAULT_PLACEMENT, PLAYER, BOX)).toEqual({
      left: 400,
      edge: 'bottom',
      distance: 20,
    });
  });

  it('keeps the same spot in proportion when the player grows to full screen', () => {
    const placement: BoxPlacement = { x: 0.25, y: 0.3, edge: 'top' };
    expect(offsetFor(placement, { width: 1920, height: 1080 }, BOX)).toEqual({
      left: 380,
      edge: 'top',
      distance: 324,
    });
  });

  it('keeps the whole box inside the video near the edges', () => {
    expect(offsetFor({ x: 0.98, y: 0.02, edge: 'top' }, PLAYER, BOX)).toMatchObject({
      left: 800,
      distance: 10,
    });
    expect(offsetFor({ x: 0, y: 0.05, edge: 'bottom' }, PLAYER, BOX)).toMatchObject({
      left: 0,
      distance: 440,
    });
  });

  it('keeps the top of a box taller than the video inside it, even when anchored at the bottom', () => {
    const tall = { width: 200, height: 600 };
    const offset = offsetFor({ x: 0.5, y: 0.96, edge: 'bottom' }, PLAYER, tall);
    expect(topOf(offset, PLAYER, tall)).toBe(0);
  });

  it('pins a box wider or taller than the video to its top left corner', () => {
    expect(offsetFor({ x: 0.5, y: 0.5, edge: 'top' }, { width: 150, height: 40 }, BOX)).toEqual({
      left: 0,
      edge: 'top',
      distance: 0,
    });
  });
});

describe('placementAt', () => {
  it('anchors a box in the lower half by its bottom, so a taller box grows upwards', () => {
    expect(placementAt(400, 300, PLAYER, BOX)).toEqual({ x: 0.5, y: 0.72, edge: 'bottom' });
  });

  it('anchors a box in the upper half by its top, so a taller box grows downwards', () => {
    expect(placementAt(100, 100, PLAYER, BOX)).toEqual({ x: 0.2, y: 0.2, edge: 'top' });
  });

  it('anchors by the bottom when the centre of the box is exactly in the middle', () => {
    expect(placementAt(0, 220, PLAYER, BOX).edge).toBe('bottom');
  });

  it('stops the box at the edges of the video', () => {
    expect(placementAt(-50, 900, PLAYER, BOX)).toEqual({ x: 0.1, y: 1, edge: 'bottom' });
    expect(placementAt(5000, -10, PLAYER, BOX)).toEqual({ x: 0.9, y: 0, edge: 'top' });
  });

  it('gives back the same box position it was made from', () => {
    for (const [left, top] of [
      [123, 45],
      [600, 400],
      [0, 0],
      [800, 440],
    ] as const) {
      const offset = offsetFor(placementAt(left, top, PLAYER, BOX), PLAYER, BOX);
      expect(offset.left).toBeCloseTo(left);
      expect(topOf(offset, PLAYER, BOX)).toBeCloseTo(top);
    }
  });
});

describe('toggledEdge', () => {
  it('sends a box at the bottom to the top and back, keeping it in the same column', () => {
    const top = toggledEdge({ x: 0.3, y: 0.7, edge: 'bottom' });
    expect(top).toEqual({ x: 0.3, y: 0.04, edge: 'top' });
    expect(toggledEdge(top)).toEqual({ x: 0.3, y: 0.96, edge: 'bottom' });
  });
});
