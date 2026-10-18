import type { Cue } from './cue';

const NO_CUES: readonly Cue[] = Object.freeze([]);

export class SubtitleTrack {
  readonly cues: readonly Cue[];
  private readonly boundaries: number[];
  private readonly activeBySegment: (readonly Cue[])[];

  constructor(cues: readonly Cue[]) {
    this.cues = cues
      .filter((cue) => cue.endMs > cue.startMs)
      .toSorted((a, b) => a.startMs - b.startMs);

    const times = this.cues.flatMap((cue) => [cue.startMs, cue.endMs]);
    this.boundaries = [...new Set(times)].sort((a, b) => a - b);

    let nextCue = 0;
    let active: Cue[] = [];
    this.activeBySegment = this.boundaries.map((boundary) => {
      active = active.filter((cue) => cue.endMs > boundary);
      for (let cue = this.cues[nextCue]; cue && cue.startMs <= boundary; cue = this.cues[nextCue]) {
        active.push(cue);
        nextCue += 1;
      }
      return Object.freeze(active);
    });
  }

  activeAt(timeMs: number): readonly Cue[] {
    let low = 0;
    let high = this.boundaries.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      const boundary = this.boundaries[middle];
      if (boundary !== undefined && boundary <= timeMs) low = middle + 1;
      else high = middle;
    }
    return this.activeBySegment[low - 1] ?? NO_CUES;
  }
}
