import * as z from 'zod/mini';
import { type Cue, type CueWord, SubtitleFormatError } from './cue';

const Json3Track = z.object({
  events: z.array(
    z.object({
      tStartMs: z.number(),
      dDurationMs: z.optional(z.number()),
      aAppend: z.optional(z.number()),
      segs: z.optional(
        z.array(z.object({ utf8: z.optional(z.string()), tOffsetMs: z.optional(z.number()) })),
      ),
    }),
  ),
});

type Json3Event = z.infer<typeof Json3Track>['events'][number];
type TimedText = Omit<Cue, 'id' | 'lang'>;

export function parseYouTubeJson3(source: string, lang: string): Cue[] {
  const { events } = readTrack(source);
  const lines = uniqueLines(events.flatMap(toTimedText));
  const isAutomatic = events.some((event) => event.aAppend !== undefined);
  const timed = isAutomatic ? oneLineAtATime(lines) : lines;
  return timed.map((line, id) => ({ id, ...line, lang }));
}

function readTrack(source: string): z.infer<typeof Json3Track> {
  let json: unknown;
  try {
    json = JSON.parse(source);
  } catch (error) {
    throw new SubtitleFormatError('YouTube caption track is not JSON', { cause: error });
  }

  const track = Json3Track.safeParse(json);
  if (!track.success) {
    throw new SubtitleFormatError('YouTube caption track is not json3', { cause: track.error });
  }
  return track.data;
}

function toTimedText(event: Json3Event): TimedText[] {
  const { tStartMs: startMs, dDurationMs: durationMs = 0, segs = [] } = event;
  const text = cleanText(segs.map((seg) => seg.utf8 ?? '').join(''));
  if (text === '' || durationMs <= 0) return [];

  const line = { startMs, endMs: startMs + durationMs, text };
  if (!segs.some((seg) => seg.tOffsetMs !== undefined)) return [line];
  let said = '';
  const words: CueWord[] = [];
  for (const seg of segs) {
    said += seg.utf8 ?? '';
    const textEnd = cleanText(said).length;
    if (textEnd > (words.at(-1)?.textEnd ?? 0)) {
      words.push({ startMs: startMs + (seg.tOffsetMs ?? 0), textEnd });
    }
  }
  return [{ ...line, words }];
}

function cleanText(text: string): string {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .join('\n');
}

function uniqueLines(lines: TimedText[]): TimedText[] {
  const seen = new Set<string>();
  return lines.filter(({ startMs, endMs, text }) => {
    const key = `${String(startMs)}|${String(endMs)}|${text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function oneLineAtATime(lines: TimedText[]): TimedText[] {
  const sorted = lines.toSorted((a, b) => a.startMs - b.startMs);
  return sorted.map((line, index) => {
    let next = index + 1;
    while ((sorted[next]?.startMs ?? Infinity) <= line.startMs) next += 1;
    const nextStartMs = sorted[next]?.startMs ?? Infinity;
    return { ...line, endMs: Math.min(line.endMs, nextStartMs) };
  });
}
