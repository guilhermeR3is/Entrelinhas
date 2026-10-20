export type BoxEdge = 'top' | 'bottom';

export interface BoxPlacement {
  x: number;
  y: number;
  edge: BoxEdge;
}

export interface Size {
  width: number;
  height: number;
}

export interface BoxOffset {
  left: number;
  edge: BoxEdge;
  distance: number;
}

const EDGE_GAP = 0.04;

export const DEFAULT_PLACEMENT: BoxPlacement = { x: 0.5, y: 1 - EDGE_GAP, edge: 'bottom' };

export function offsetFor(placement: BoxPlacement, frame: Size, box: Size): BoxOffset {
  const line = placement.y * frame.height;
  const distance = placement.edge === 'bottom' ? frame.height - line : line;
  return {
    left: clamp(placement.x * frame.width - box.width / 2, 0, frame.width - box.width),
    edge: placement.edge,
    distance: clamp(distance, 0, frame.height - box.height),
  };
}

export function topOf(offset: BoxOffset, frame: Size, box: Size): number {
  return offset.edge === 'top' ? offset.distance : frame.height - offset.distance - box.height;
}

export function placementAt(left: number, top: number, frame: Size, box: Size): BoxPlacement {
  const clampedLeft = clamp(left, 0, frame.width - box.width);
  const clampedTop = clamp(top, 0, frame.height - box.height);
  const x = (clampedLeft + box.width / 2) / frame.width;
  if (clampedTop + box.height / 2 >= frame.height / 2) {
    return { x, y: (clampedTop + box.height) / frame.height, edge: 'bottom' };
  }
  return { x, y: clampedTop / frame.height, edge: 'top' };
}

export function toggledEdge(placement: BoxPlacement): BoxPlacement {
  return placement.edge === 'bottom'
    ? { x: placement.x, y: EDGE_GAP, edge: 'top' }
    : { x: placement.x, y: 1 - EDGE_GAP, edge: 'bottom' };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}
