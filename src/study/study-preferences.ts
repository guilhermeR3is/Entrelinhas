import type { browser } from 'wxt/browser';
import * as z from 'zod/mini';
import { logger } from '../logger';
import { DEFAULT_PLACEMENT, type BoxPlacement } from '../overlay/box-placement';
import { MAX_SPEED, MIN_SPEED } from './playback-speed';

export interface StudyChoices {
  speed: number;
  autoPause: boolean;
  blurred: boolean;
}

export interface StudyPreferences extends StudyChoices {
  placement: BoxPlacement;
}

export type PreferenceStorage = Pick<typeof browser.storage.local, 'get' | 'set'>;

export const DEFAULT_PREFERENCES: StudyPreferences = {
  speed: 1,
  autoPause: false,
  blurred: false,
  placement: DEFAULT_PLACEMENT,
};

const fraction = () => z.number().check(z.gte(0), z.lte(1));

const SCHEMAS = {
  speed: z.number().check(z.gte(MIN_SPEED), z.lte(MAX_SPEED)),
  autoPause: z.boolean(),
  blurred: z.boolean(),
  placement: z.object({ x: fraction(), y: fraction(), edge: z.enum(['top', 'bottom']) }),
};

const KEYS = Object.keys(SCHEMAS) as (keyof StudyPreferences)[];

export class StudyPreferenceStore {
  private constructor(
    private readonly storageArea: PreferenceStorage,
    private preferences: StudyPreferences,
  ) {}

  static async load(storageArea: PreferenceStorage): Promise<StudyPreferenceStore> {
    let stored: Record<string, unknown>;
    try {
      stored = await storageArea.get(KEYS);
    } catch (error) {
      logger.error('Could not read the study preferences', error);
      return new StudyPreferenceStore(storageArea, DEFAULT_PREFERENCES);
    }
    return new StudyPreferenceStore(storageArea, {
      speed: read('speed', stored),
      autoPause: read('autoPause', stored),
      blurred: read('blurred', stored),
      placement: read('placement', stored),
    });
  }

  get current(): StudyPreferences {
    return this.preferences;
  }

  remember(change: Partial<StudyPreferences>): void {
    this.preferences = { ...this.preferences, ...change };
    this.storageArea.set(change).catch((error: unknown) => {
      logger.error('Could not save the study preferences', error);
    });
  }
}

function read<Key extends keyof StudyPreferences>(
  key: Key,
  stored: Record<string, unknown>,
): StudyPreferences[Key] {
  if (!(key in stored)) return DEFAULT_PREFERENCES[key];
  const value = SCHEMAS[key].safeParse(stored[key]);
  if (value.success) return value.data as StudyPreferences[Key];
  logger.error(`Ignored an invalid stored ${key}`, value.error);
  return DEFAULT_PREFERENCES[key];
}
