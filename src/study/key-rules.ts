import { YOUTUBE_SHORTCUTS, type SiteShortcut } from '../youtube/youtube-shortcuts';
import { STUDY_COMMANDS, type KeyBinding, type StudyCommand, type StudyKeys } from './study-keys';

export type KeyProblem =
  | { kind: 'not-a-letter' }
  | { kind: 'site'; shortcut: SiteShortcut }
  | { kind: 'taken'; by: StudyCommand };

type PressedKey = Pick<KeyboardEvent, 'key' | 'shiftKey' | 'ctrlKey' | 'altKey' | 'metaKey'>;

const LETTER = /^[a-zç]$/;

export function bindingFor(event: PressedKey): KeyBinding | null {
  if (event.ctrlKey || event.altKey || event.metaKey) return null;
  const key = event.key.toLowerCase();
  return LETTER.test(key) ? { key, shift: event.shiftKey } : null;
}

export function problemWith(
  command: StudyCommand,
  binding: KeyBinding,
  keys: StudyKeys,
): KeyProblem | null {
  if (!LETTER.test(binding.key)) return { kind: 'not-a-letter' };
  const shortcut = YOUTUBE_SHORTCUTS.find(
    (site) => site.key === binding.key && (site.shift === null || site.shift === binding.shift),
  );
  if (shortcut) return { kind: 'site', shortcut };
  const taken = STUDY_COMMANDS.find(
    (other) =>
      other !== command && keys[other].key === binding.key && keys[other].shift === binding.shift,
  );
  return taken ? { kind: 'taken', by: taken } : null;
}

export function keysProblem(keys: StudyKeys): KeyProblem | null {
  for (const command of STUDY_COMMANDS) {
    const problem = problemWith(command, keys[command], keys);
    if (problem) return problem;
  }
  return null;
}
