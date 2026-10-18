import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { watchPlayerControls } from './player-controls';

function placeAt(element: Element, top: number, bottom: number): void {
  Object.defineProperty(element, 'getBoundingClientRect', {
    value: () => ({ top, bottom }),
  });
}

function nextMutations(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve));
}

describe('watchPlayerControls', () => {
  let player: Element;
  let observer: MutationObserver | undefined;
  const onLift = vi.fn();

  beforeEach(() => {
    const { window } = new JSDOM(
      '<div id="movie_player" class="playing-mode"><div class="ytp-chrome-bottom"></div></div>',
    );
    vi.stubGlobal('MutationObserver', window.MutationObserver);
    player = window.document.querySelector('#movie_player') ?? window.document.body;
    placeAt(player, 0, 480);
    const controls = player.querySelector('.ytp-chrome-bottom');
    if (controls) placeAt(controls, 421, 480);
    onLift.mockClear();
  });

  afterEach(() => {
    observer?.disconnect();
    vi.unstubAllGlobals();
  });

  it('lifts by the distance from the bottom of the player to the top of the controls', () => {
    observer = watchPlayerControls(player, onLift);
    expect(onLift).toHaveBeenCalledExactlyOnceWith(59);
  });

  it('drops the lift when the player hides its controls and lifts again when they return', async () => {
    observer = watchPlayerControls(player, onLift);
    player.classList.add('ytp-autohide');
    await nextMutations();
    expect(onLift).toHaveBeenLastCalledWith(0);

    player.classList.remove('ytp-autohide');
    await nextMutations();
    expect(onLift).toHaveBeenLastCalledWith(59);
  });

  it('ignores class changes that do not move the controls', async () => {
    observer = watchPlayerControls(player, onLift);
    player.classList.add('paused-mode');
    await nextMutations();
    expect(onLift).toHaveBeenCalledOnce();
  });

  it('does not lift a player without controls', () => {
    player.querySelector('.ytp-chrome-bottom')?.remove();
    observer = watchPlayerControls(player, onLift);
    expect(onLift).toHaveBeenCalledExactlyOnceWith(0);
  });
});
