import type { SubtitleTrack } from '../subtitles/subtitle-track';
import { groupSentences } from '../subtitles/sentence-groups';

const MAX_FRAME_STEP_MS = 1000;

export class AutoPause {
  private track: SubtitleTrack | null = null;
  private sentenceEnds: readonly number[] = [];
  private lastTimeMs: number | null = null;
  private lastLine = '';

  constructor(private on = false) {}

  get enabled(): boolean {
    return this.on;
  }

  toggle(): boolean {
    this.on = !this.on;
    return this.on;
  }

  restart(): void {
    this.lastTimeMs = null;
    this.lastLine = '';
  }

  sentenceEndCrossed(track: SubtitleTrack, timeMs: number): number | null {
    if (track !== this.track) {
      this.track = track;
      const ends = groupSentences(track.cues).map((sentence) => sentence.endMs);
      this.sentenceEnds = [...new Set(ends)].sort((a, b) => a - b);
    }
    const lastTimeMs = this.lastTimeMs;
    this.lastTimeMs = timeMs;
    if (!this.on || lastTimeMs === null) return null;
    if (timeMs <= lastTimeMs || timeMs - lastTimeMs > MAX_FRAME_STEP_MS) return null;

    const end = this.sentenceEnds[firstAfter(this.sentenceEnds, lastTimeMs)];
    return end !== undefined && end <= timeMs ? end : null;
  }

  lineEnded(line: string): boolean {
    const lastLine = this.lastLine;
    this.lastLine = line;
    return this.on && lastLine !== '' && line !== lastLine;
  }
}

function firstAfter(sortedTimes: readonly number[], timeMs: number): number {
  let low = 0;
  let high = sortedTimes.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    const time = sortedTimes[middle];
    if (time !== undefined && time <= timeMs) low = middle + 1;
    else high = middle;
  }
  return low;
}
