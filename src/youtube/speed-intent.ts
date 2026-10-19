const SPEED_MENU = '.ytp-settings-menu, [class*="ytp-variable-speed-panel"]';
const SPEED_KEYS = new Set(['<', '>']);
const KEY_INTENT_MS = 1000;

export function watchSpeedIntent(
  page: Window,
  signal: AbortSignal,
  now: () => number = () => performance.now(),
): () => boolean {
  let speedKeyAtMs = -Infinity;
  page.addEventListener(
    'keydown',
    (event) => {
      if (SPEED_KEYS.has(event.key)) speedKeyAtMs = now();
    },
    { capture: true, signal },
  );
  return () =>
    now() - speedKeyAtMs < KEY_INTENT_MS ||
    page.document.activeElement?.closest(SPEED_MENU) != null;
}
