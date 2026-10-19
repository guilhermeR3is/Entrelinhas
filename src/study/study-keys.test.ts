import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listenForStudyKeys, type StudyCommand } from './study-keys';

describe('listenForStudyKeys', () => {
  let window: JSDOM['window'];
  let listeners: AbortController;
  let commands: StudyCommand[];
  let handled: boolean;
  let pageKeys: string[];

  beforeEach(() => {
    const dom = new JSDOM(
      '<div id="player" tabindex="0"></div><input id="search"><div id="comment" contenteditable="true"></div><div id="host"></div>',
    );
    window = dom.window;
    vi.stubGlobal('Element', dom.window.Element);
    listeners = new dom.window.AbortController();
    commands = [];
    handled = true;
    pageKeys = [];
    listenForStudyKeys(
      window as unknown as Window,
      (command) => {
        commands.push(command);
        return handled;
      },
      listeners.signal,
    );
    window.document.addEventListener('keydown', (event) => pageKeys.push(event.key));
  });

  afterEach(() => {
    listeners.abort();
    vi.unstubAllGlobals();
  });

  function press(selector: string, key: string, init: KeyboardEventInit = {}): KeyboardEvent {
    const target = window.document.querySelector(selector);
    if (!target) throw new Error(`Missing ${selector}`);
    const event = new window.KeyboardEvent('keydown', {
      key,
      bubbles: true,
      cancelable: true,
      composed: true,
      ...init,
    });
    target.dispatchEvent(event);
    return event;
  }

  it('turns Z and X into slower and faster and keeps them from the page', () => {
    const slower = press('#player', 'z');
    const faster = press('#player', 'X', { shiftKey: false });
    expect(commands).toEqual(['slower', 'faster']);
    expect(slower.defaultPrevented).toBe(true);
    expect(faster.defaultPrevented).toBe(true);
    expect(pageKeys).toEqual([]);
  });

  it('lets every other key reach the page', () => {
    press('#player', 'k');
    press('#player', '>', { shiftKey: true });
    expect(commands).toEqual([]);
    expect(pageKeys).toEqual(['k', '>']);
  });

  it('ignores the keys with Shift, Ctrl, Alt or Cmd held', () => {
    press('#player', 'Z', { shiftKey: true });
    press('#player', 'z', { ctrlKey: true });
    press('#player', 'z', { altKey: true });
    press('#player', 'x', { metaKey: true });
    expect(commands).toEqual([]);
    expect(pageKeys).toHaveLength(4);
  });

  it('leaves the keys alone while the person types in a field', () => {
    press('#search', 'z');
    press('#comment', 'x');
    expect(commands).toEqual([]);
    expect(pageKeys).toEqual(['z', 'x']);
  });

  it('looks through shadow roots to find the field being typed in', () => {
    const host = window.document.querySelector('#host');
    const field = window.document.createElement('textarea');
    host?.attachShadow({ mode: 'open' }).append(field);
    field.dispatchEvent(
      new window.KeyboardEvent('keydown', { key: 'z', bubbles: true, composed: true }),
    );
    expect(commands).toEqual([]);
  });

  it('lets the key through when nothing handles the command', () => {
    handled = false;
    const event = press('#player', 'x');
    expect(commands).toEqual(['faster']);
    expect(event.defaultPrevented).toBe(false);
    expect(pageKeys).toEqual(['x']);
  });

  it('stops listening once aborted', () => {
    listeners.abort();
    press('#player', 'z');
    expect(commands).toEqual([]);
  });
});
