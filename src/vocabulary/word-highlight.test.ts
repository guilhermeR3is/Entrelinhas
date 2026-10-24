import { describe, expect, it, vi } from 'vitest';
import { WordHighlight } from './word-highlight';
import { parseWordRanks } from './word-ranks';

const RANKS = parseWordRanks('the\nyou\n');

describe('WordHighlight', () => {
  it('does not load the word list while the highlight is off', () => {
    const loadRanks = vi.fn(() => Promise.resolve(RANKS));
    const onChange = vi.fn();
    const highlight = new WordHighlight(onChange, loadRanks);

    highlight.follow('off');

    expect(loadRanks).not.toHaveBeenCalled();
    expect(onChange).toHaveBeenLastCalledWith({ ranks: null, level: null });
  });

  it('loads the list once when the highlight is turned on and tells when it arrives', async () => {
    const loadRanks = vi.fn(() => Promise.resolve(RANKS));
    const onChange = vi.fn();
    const highlight = new WordHighlight(onChange, loadRanks);

    highlight.follow(2000);
    highlight.follow(5000);
    expect(onChange).toHaveBeenLastCalledWith({ ranks: null, level: 5000 });

    await vi.waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith({ ranks: RANKS, level: 5000 });
    });
    highlight.follow('off');
    highlight.follow(1000);
    expect(loadRanks).toHaveBeenCalledTimes(1);
    expect(highlight.current).toEqual({ ranks: RANKS, level: 1000 });
  });

  it('tries to load the list again the next time when it could not be read', async () => {
    const loadRanks = vi
      .fn<() => Promise<typeof RANKS | null>>()
      .mockResolvedValueOnce(null)
      .mockResolvedValue(RANKS);
    const onChange = vi.fn();
    const highlight = new WordHighlight(onChange, loadRanks);

    highlight.follow(2000);
    await vi.waitFor(() => {
      expect(loadRanks).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledTimes(2);
    });
    highlight.follow(2000);

    await vi.waitFor(() => {
      expect(highlight.current.ranks).toBe(RANKS);
    });
  });
});
