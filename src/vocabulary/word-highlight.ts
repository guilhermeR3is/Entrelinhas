import type { HighlightLevel, HighlightSetting, WordRanks } from './word-ranks';
import { loadWordRanks } from './word-ranks-service';

export interface Highlight {
  ranks: WordRanks | null;
  level: HighlightLevel | null;
}

export const NO_HIGHLIGHT: Highlight = Object.freeze({ ranks: null, level: null });

export class WordHighlight {
  private ranks: WordRanks | null = null;
  private loading: Promise<void> | null = null;
  private setting: HighlightSetting = 'off';

  constructor(
    private readonly onChange: (highlight: Highlight) => void,
    private readonly loadRanks: () => Promise<WordRanks | null> = loadWordRanks,
  ) {}

  get current(): Highlight {
    return { ranks: this.ranks, level: this.setting === 'off' ? null : this.setting };
  }

  follow(setting: HighlightSetting): void {
    this.setting = setting;
    if (setting !== 'off' && !this.ranks && !this.loading) {
      this.loading = this.loadRanks().then((ranks) => {
        this.ranks = ranks;
        this.loading = null;
        this.onChange(this.current);
      });
    }
    this.onChange(this.current);
  }
}
