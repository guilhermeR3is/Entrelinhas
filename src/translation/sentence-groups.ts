import type { Cue } from '../subtitles/cue';

const MAX_CUES_PER_SENTENCE = 3;
const CLOSERS = `["'”’)\\]]*`;
const SENTENCE_END = new RegExp(`[.!?]${CLOSERS}$`, 'u');
const TRAILING_ELLIPSIS = new RegExp(`(\\.\\.\\.|…)${CLOSERS}$`, 'u');
const SOUND_ONLY = /^(\[[^\]]*\]|\([^)]*\)|♪.*♪?)$/su;

export function groupSentences(cues: readonly Cue[]): Cue[] {
  const sentences: Cue[] = [];
  let pending: Cue[] = [];

  const emit = (group: readonly Cue[]) => {
    const [first] = group;
    if (!first) return;
    sentences.push({
      id: sentences.length,
      startMs: first.startMs,
      endMs: Math.max(...group.map((cue) => cue.endMs)),
      text: group.map((cue) => cue.text.trim()).join(' '),
      lang: first.lang,
    });
  };
  const emitEach = (group: readonly Cue[]) => {
    for (const cue of group) emit([cue]);
  };

  for (const cue of cues) {
    const text = cue.text.trim();
    if (SOUND_ONLY.test(text)) {
      emitEach(pending);
      pending = [];
      emit([cue]);
      continue;
    }

    pending.push(cue);
    if (SENTENCE_END.test(text) && !TRAILING_ELLIPSIS.test(text)) {
      emit(pending);
      pending = [];
    } else if (pending.length === MAX_CUES_PER_SENTENCE) {
      emitEach(pending);
      pending = [];
    }
  }
  emitEach(pending);
  return sentences;
}
