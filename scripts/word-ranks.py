import re
import sys
from pathlib import Path

from wordfreq import top_n_list

WORD_COUNT = 25_000
WORD = re.compile(r"[a-z]+(?:'[a-z]+)*")


def main() -> None:
    words = [word for word in top_n_list("en", 40_000) if WORD.fullmatch(word)]
    if len(words) < WORD_COUNT:
        sys.exit(f"only {len(words)} words left after filtering")
    target = Path(__file__).resolve().parent.parent / "public" / "word-ranks.txt"
    target.write_text("\n".join(words[:WORD_COUNT]) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
