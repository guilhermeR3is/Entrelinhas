import * as z from 'zod/mini';
import { browser } from 'wxt/browser';
import { logger } from '../logger';
import type { PageTranslatorStatus, PortugueseTranslation } from './portuguese-translation';
import type { Translator, TranslatorApi, TranslatorAvailability } from './translator-api';

const STATUS_TYPE = 'projeto-bilingue:page-translator-status';
const TRANSLATE_TYPE = 'projeto-bilingue:translate-for-frame';
const POLL_MS = 1000;
const SETTLE_MS = 5000;

const FrameRequest = z.discriminatedUnion('type', [
  z.object({ type: z.literal(STATUS_TYPE) }),
  z.object({ type: z.literal(TRANSLATE_TYPE), text: z.string() }),
]);
const StatusAnswer = z.object({
  status: z.enum(['ready', 'preparing', 'unsupported', 'failed']),
});
const TranslateAnswer = z.union([
  z.object({ translation: z.string() }),
  z.object({ failed: z.literal(true) }),
]);

type FrameRequest = z.infer<typeof FrameRequest>;
type FrameAnswer = { status: PageTranslatorStatus } | { translation: string } | { failed: true };
type Relay = Pick<typeof browser, 'runtime' | 'tabs'>;

function readFrameRequest(message: unknown): FrameRequest | null {
  const parsed = FrameRequest.safeParse(message);
  return parsed.success ? parsed.data : null;
}

function unanswered(request: FrameRequest): FrameAnswer {
  return request.type === STATUS_TYPE ? { status: 'preparing' } : { failed: true };
}

export function relayFrameTranslation(api: Relay = browser): void {
  api.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const request = readFrameRequest(message);
    if (!request) return false;
    const tabId = sender.tab?.id;
    if (tabId === undefined || !sender.frameId) {
      sendResponse(unanswered(request));
      return false;
    }
    api.tabs.sendMessage(tabId, request, { frameId: 0 }).then(
      (answer: unknown) => {
        sendResponse(answer ?? unanswered(request));
      },
      (error: unknown) => {
        logger.error('Could not reach the page around the player', error);
        sendResponse(unanswered(request));
      },
    );
    return true;
  });
}

export function servePageTranslation(
  translation: PortugueseTranslation,
  signal: AbortSignal,
): void {
  const answer = (
    message: unknown,
    _sender: unknown,
    sendResponse: (response: FrameAnswer) => void,
  ) => {
    const request = readFrameRequest(message);
    if (!request) return false;
    if (request.type === STATUS_TYPE) {
      sendResponse({ status: translation.pageStatus() });
      return true;
    }
    translation.translateText(request.text, signal).then(
      (translated) => {
        sendResponse(translated === null ? { failed: true } : { translation: translated });
      },
      (error: unknown) => {
        logger.error('Could not translate for the player', error);
        sendResponse({ failed: true });
      },
    );
    return true;
  };
  browser.runtime.onMessage.addListener(answer);
  signal.addEventListener('abort', () => {
    browser.runtime.onMessage.removeListener(answer);
  });
}

export function frameTranslatorApi(): TranslatorApi {
  return {
    availability: async (): Promise<TranslatorAvailability> => {
      let status = await pageStatus();
      for (let waited = 0; status === 'preparing' && waited < SETTLE_MS; waited += POLL_MS) {
        await pause(POLL_MS);
        status = await pageStatus();
      }
      if (status === 'ready') return 'available';
      return status === 'preparing' ? 'downloadable' : 'unavailable';
    },
    create: async ({ signal }) => {
      for (;;) {
        signal?.throwIfAborted();
        const status = await pageStatus();
        if (status === 'ready') return relayedTranslator;
        if (status !== 'preparing') throw new Error(`The page translator is ${status}`);
        await pause(POLL_MS);
      }
    },
  };
}

const relayedTranslator: Translator = {
  translate: async (text, options) => {
    options?.signal?.throwIfAborted();
    const answer = TranslateAnswer.safeParse(
      await browser.runtime.sendMessage({ type: TRANSLATE_TYPE, text }),
    );
    options?.signal?.throwIfAborted();
    if (!answer.success || 'failed' in answer.data) {
      throw new Error('The page could not translate for the player');
    }
    return answer.data.translation;
  },
  destroy: () => undefined,
};

async function pageStatus(): Promise<PageTranslatorStatus> {
  try {
    const answer: unknown = await browser.runtime.sendMessage({ type: STATUS_TYPE });
    const parsed = StatusAnswer.safeParse(answer);
    if (parsed.success) return parsed.data.status;
    logger.error('Unexpected page translator status', answer);
    return 'failed';
  } catch (error) {
    logger.error('Could not ask the page about its translator', error);
    return 'preparing';
  }
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
