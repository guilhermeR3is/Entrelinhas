import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { watchSpeedIntent } from './speed-intent';

describe('watchSpeedIntent', () => {
  let window: JSDOM['window'];
  let listeners: AbortController;
  let clockMs: number;
  let personChangedSpeed: () => boolean;

  beforeEach(() => {
    const { window: domWindow } = new JSDOM(`
      <div id="movie_player">
        <div class="ytp-settings-menu"><button id="speed-option">1,5</button></div>
        <button id="variable-speed" class="ytp-button ytp-variable-speed-panel-preset-button">2</button>
        <a id="thumbnail" href="#">Next video</a>
      </div>`);
    window = domWindow;
    listeners = new domWindow.AbortController();
    clockMs = 0;
    personChangedSpeed = watchSpeedIntent(
      window as unknown as Window,
      listeners.signal,
      () => clockMs,
    );
  });

  afterEach(() => {
    listeners.abort();
  });

  function focus(selector: string): void {
    window.document.querySelector<HTMLElement>(selector)?.focus();
  }

  function press(key: string): void {
    window.document.body.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true }));
  }

  it('says no when nothing in the player menu has focus', () => {
    focus('#thumbnail');
    expect(personChangedSpeed()).toBe(false);
  });

  it('says yes while the focus is on an option of the speed menu', () => {
    focus('#speed-option');
    expect(personChangedSpeed()).toBe(true);
    focus('#variable-speed');
    expect(personChangedSpeed()).toBe(true);
  });

  it('says yes for one second after the player speed keys', () => {
    press('>');
    clockMs = 900;
    expect(personChangedSpeed()).toBe(true);
    clockMs = 1100;
    expect(personChangedSpeed()).toBe(false);

    press('<');
    expect(personChangedSpeed()).toBe(true);
  });

  it('ignores other keys', () => {
    press('k');
    press('.');
    expect(personChangedSpeed()).toBe(false);
  });
});
