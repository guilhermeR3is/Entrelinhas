export const NATIVE_CONTROLS_PX = 54;
export const NATIVE_CONTROLS_HIDE_MS = 2500;

export function watchNativeControls(
  video: HTMLVideoElement,
  onLift: (liftPx: number) => void,
): () => void {
  const listeners = new AbortController();
  const page = video.ownerDocument;
  let pointerMovedRecently = false;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  let shownLift: number | null = null;

  const update = () => {
    const shown = video.controls && (video.paused || pointerMovedRecently);
    const lift = shown ? NATIVE_CONTROLS_PX : 0;
    if (lift === shownLift) return;
    shownLift = lift;
    onLift(lift);
  };
  const followPointer = (event: PointerEvent) => {
    const area = video.getBoundingClientRect();
    const over =
      event.clientX >= area.left &&
      event.clientX <= area.right &&
      event.clientY >= area.top &&
      event.clientY <= area.bottom;
    clearTimeout(hideTimer);
    pointerMovedRecently = over;
    if (over) {
      hideTimer = setTimeout(() => {
        pointerMovedRecently = false;
        update();
      }, NATIVE_CONTROLS_HIDE_MS);
    }
    update();
  };

  const options = { signal: listeners.signal };
  page.addEventListener('pointermove', followPointer, { ...options, capture: true });
  page.documentElement.addEventListener(
    'pointerleave',
    () => {
      clearTimeout(hideTimer);
      pointerMovedRecently = false;
      update();
    },
    options,
  );
  for (const type of ['play', 'pause', 'emptied']) video.addEventListener(type, update, options);
  update();

  return () => {
    listeners.abort();
    clearTimeout(hideTimer);
  };
}
