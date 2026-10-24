import { browser } from 'wxt/browser';
import * as z from 'zod/mini';
import { logger } from '../logger';
import { parseWordRanks, type WordRanks } from './word-ranks';

const WORD_RANKS_REQUEST = 'projeto-bilingue:word-ranks';

const WordRanksRequest = z.object({ type: z.literal(WORD_RANKS_REQUEST) });
const WordRanksResponse = z.object({ words: z.string().check(z.minLength(1)) });

type WordRanksResponse = z.infer<typeof WordRanksResponse> | { failed: true };

export function serveWordRanks(
  readList: () => Promise<string> = async () => {
    const response = await fetch(browser.runtime.getURL('/word-ranks.txt'));
    if (!response.ok) throw new Error(`word-ranks.txt answered ${String(response.status)}`);
    return response.text();
  },
): void {
  let list: Promise<string> | undefined;
  const loadList = () =>
    (list ??= readList().catch((error: unknown) => {
      list = undefined;
      throw error;
    }));

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!WordRanksRequest.safeParse(message).success) return false;

    const respond = (response: WordRanksResponse) => {
      sendResponse(response);
    };
    loadList().then(
      (words) => {
        respond({ words });
      },
      (error: unknown) => {
        logger.error('Word ranks unavailable', error);
        respond({ failed: true });
      },
    );
    return true;
  });
}

export async function loadWordRanks(): Promise<WordRanks | null> {
  try {
    const response: unknown = await browser.runtime.sendMessage({ type: WORD_RANKS_REQUEST });
    const answer = WordRanksResponse.safeParse(response);
    if (!answer.success) {
      logger.error('Unexpected word ranks answer', response);
      return null;
    }
    return parseWordRanks(answer.data.words);
  } catch (error) {
    logger.error('Word ranks unreachable', error);
    return null;
  }
}
