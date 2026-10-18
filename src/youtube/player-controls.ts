const HIDDEN_CONTROLS_CLASS = 'ytp-autohide';
const CONTROLS_SELECTOR = '.ytp-chrome-bottom';

export function watchPlayerControls(
  player: Element,
  onLift: (liftPx: number) => void,
): MutationObserver {
  let shownLift: number | null = null;
  const measure = () => {
    const lift = controlsLift(player);
    if (lift === shownLift) return;
    shownLift = lift;
    onLift(lift);
  };

  const observer = new MutationObserver(measure);
  observer.observe(player, { attributes: true, attributeFilter: ['class'] });
  measure();
  return observer;
}

function controlsLift(player: Element): number {
  const controls = player.querySelector(CONTROLS_SELECTOR);
  if (!controls || player.classList.contains(HIDDEN_CONTROLS_CLASS)) return 0;
  const distance = player.getBoundingClientRect().bottom - controls.getBoundingClientRect().top;
  return Math.max(0, Math.round(distance));
}
