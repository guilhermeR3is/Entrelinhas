export type StudyCommand = 'slower' | 'faster' | 'auto-pause';

type KeyBinding = { key: string; shift: boolean };

const STUDY_KEYS: Record<StudyCommand, KeyBinding> = {
  slower: { key: 'z', shift: false },
  faster: { key: 'x', shift: false },
  'auto-pause': { key: 'p', shift: false },
};
const COMMANDS = Object.keys(STUDY_KEYS) as StudyCommand[];
const EDITABLE = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';

export function listenForStudyKeys(
  page: Window,
  onCommand: (command: StudyCommand) => boolean,
  signal: AbortSignal,
): void {
  page.addEventListener(
    'keydown',
    (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event)) return;
      const command = commandFor(event);
      if (!command || !onCommand(command)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    },
    { capture: true, signal },
  );
}

function commandFor(event: KeyboardEvent): StudyCommand | undefined {
  const key = event.key.toLowerCase();
  return COMMANDS.find(
    (command) => STUDY_KEYS[command].key === key && STUDY_KEYS[command].shift === event.shiftKey,
  );
}

function isTyping(event: KeyboardEvent): boolean {
  const target = event.composedPath()[0];
  return target instanceof Element && target.closest(EDITABLE) !== null;
}
