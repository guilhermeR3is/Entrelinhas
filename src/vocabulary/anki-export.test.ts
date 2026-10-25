import { describe, expect, it } from 'vitest';
import { ankiCsv } from './anki-export';
import type { SavedWord } from './vocabulary-store';

const ZEITGEIST: SavedWord = {
  word: 'zeitgeist',
  shown: 'Zeitgeist',
  translation: 'espírito da época',
  sentence: 'The zeitgeist of the 90s.\nZeitgeist, again.',
  sentenceTranslation: 'O espírito da época dos anos 90.',
  videoTitle: 'Words "we" borrowed',
  videoUrl: 'https://www.youtube.com/watch?v=abc&t=83s',
  timeMs: 83_250,
  savedAt: 0,
  box: 0,
  dueAt: 0,
  reviews: 0,
};

function rowsOf(csv: string): string[] {
  return csv.split('\n').filter((line) => line !== '' && !line.startsWith('#'));
}

describe('ankiCsv', () => {
  it('starts with the header lines Anki reads before importing', () => {
    expect(ankiCsv([]).split('\n').slice(0, 5)).toEqual([
      '#separator:Comma',
      '#html:true',
      '#tags:entrelinhas',
      '#guid column:1',
      '#columns:GUID,Frente,Verso',
    ]);
    expect(rowsOf(ankiCsv([]))).toEqual([]);
  });

  it('writes one note per word: the word and the sentence in front, the translations and the video on the back', () => {
    const [row] = rowsOf(ankiCsv([ZEITGEIST]));

    expect(row).toBe(
      [
        '"projeto-bilingue:zeitgeist"',
        '"<b>Zeitgeist</b><br>The <b>zeitgeist</b> of the 90s.<br><b>Zeitgeist</b>, again."',
        '"espírito da época<br><i>O espírito da época dos anos 90.</i><br><small>' +
          '<a href=""https://www.youtube.com/watch?v=abc&amp;t=83s"">Words &quot;we&quot; borrowed · 1:23</a></small>"',
      ].join(','),
    );
  });

  it('escapes HTML from the captions so it shows as text in Anki', () => {
    const [row] = rowsOf(
      ankiCsv([{ ...ZEITGEIST, sentence: 'Use <i> & zeitgeist', sentenceTranslation: null }]),
    );

    expect(row).toContain('Use &lt;i&gt; &amp; <b>zeitgeist</b>');
    expect(row).not.toContain('<i>O espírito');
  });

  it('leaves out the link when the page address is not a web address and keeps a missing translation empty', () => {
    const [row] = rowsOf(
      ankiCsv([
        { ...ZEITGEIST, translation: null, sentenceTranslation: null, videoUrl: 'file:///a' },
      ]),
    );

    expect(row?.split('","')[2]).toBe('<br><small>Words &quot;we&quot; borrowed · 1:23</small>"');
  });

  it('sorts the words alphabetically', () => {
    const csv = ankiCsv([ZEITGEIST, { ...ZEITGEIST, word: 'apple', shown: 'apple' }]);

    expect(rowsOf(csv).map((row) => row.split(',')[0])).toEqual([
      '"projeto-bilingue:apple"',
      '"projeto-bilingue:zeitgeist"',
    ]);
  });
});
