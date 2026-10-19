import type {
  Translator,
  TranslatorApi,
  TranslatorAvailability,
} from '../src/translation/translator-api';

const DOWNLOAD_STEP_MS = 500;

type FakeTranslatorPage = Pick<Window, 'location' | 'document' | 'navigator'>;

const AVAILABILITY: Record<string, TranslatorAvailability> = {
  available: 'available',
  downloadable: 'downloadable',
  'broken-download': 'downloadable',
};

export function fakeTranslatorApi(page: FakeTranslatorPage): TranslatorApi {
  const mode = new URL(page.location.href).searchParams.get('fake-translator') ?? '';
  let availability = AVAILABILITY[mode] ?? 'unavailable';
  let translations = 0;
  const translator: Translator = {
    translate: (text) => {
      translations += 1;
      page.document.documentElement.dataset.fakeTranslations = String(translations);
      return Promise.resolve(`[pt] ${text}`);
    },
    destroy: () => undefined,
  };

  return {
    availability: () => Promise.resolve(availability),
    create: async ({ monitor }) => {
      if (availability === 'available') return translator;
      if (!page.navigator.userActivation.isActive) {
        throw new DOMException('Requires a user gesture', 'NotAllowedError');
      }
      const progress = new EventTarget();
      monitor?.(progress);
      const report = (loaded: number) =>
        progress.dispatchEvent(Object.assign(new Event('downloadprogress'), { loaded }));

      report(0);
      await new Promise((resolve) => setTimeout(resolve, DOWNLOAD_STEP_MS));
      report(0.5);
      await new Promise((resolve) => setTimeout(resolve, DOWNLOAD_STEP_MS));
      if (mode === 'broken-download') throw new Error('Simulated download failure');
      report(1);
      availability = 'available';
      return translator;
    },
  };
}
