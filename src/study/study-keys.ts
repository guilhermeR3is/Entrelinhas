export type StudyCommand =
  'slower' | 'faster' | 'auto-pause' | 'repeat' | 'repeat-slow' | 'blur' | 'reveal';

export interface KeyBinding {
  key: string;
  shift: boolean;
}

export type StudyKeys = Record<StudyCommand, KeyBinding>;

export const STUDY_COMMANDS: readonly StudyCommand[] = [
  'slower',
  'faster',
  'auto-pause',
  'repeat',
  'repeat-slow',
  'blur',
  'reveal',
];

export const DEFAULT_KEYS: StudyKeys = {
  slower: { key: 'z', shift: false },
  faster: { key: 'x', shift: false },
  'auto-pause': { key: 'p', shift: false },
  repeat: { key: 'r', shift: false },
  'repeat-slow': { key: 'r', shift: true },
  blur: { key: 'b', shift: false },
  reveal: { key: 'v', shift: false },
};
const EDITABLE = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';

export function keyLabel(binding: KeyBinding): string {
  const key = binding.key.toUpperCase();
  return binding.shift ? `Shift+${key}` : key;
}

export function listenForStudyKeys(
  page: Window,
  onCommand: (command: StudyCommand) => boolean,
  signal: AbortSignal,
  keys: () => StudyKeys = () => DEFAULT_KEYS,
): void {
  page.addEventListener(
    'keydown',
    (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event)) return;
      const command = commandFor(event, keys());
      if (!command || !onCommand(command)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    },
    { capture: true, signal },
  );
}

function commandFor(event: KeyboardEvent, keys: StudyKeys): StudyCommand | undefined {
  const key = event.key.toLowerCase();
  return STUDY_COMMANDS.find(
    (command) => keys[command].key === key && keys[command].shift === event.shiftKey,
  );
}

function isTyping(event: KeyboardEvent): boolean {
  const target = event.composedPath()[0];
  return target instanceof Element && target.closest(EDITABLE) !== null;
}
