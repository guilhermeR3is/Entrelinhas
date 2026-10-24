import type { browser } from 'wxt/browser';
import * as z from 'zod/mini';
import { logger } from '../logger';
import { DEFAULT_PLACEMENT, type BoxPlacement } from '../overlay/box-placement';
import { HIGHLIGHT_LEVELS, type HighlightSetting } from '../vocabulary/word-ranks';
import { keysProblem } from './key-rules';
import { MAX_SPEED, MIN_SPEED } from './playback-speed';
import { DEFAULT_KEYS, STUDY_COMMANDS, type StudyKeys } from './study-keys';

export interface StudyChoices {
  speed: number;
  autoPause: boolean;
  blurred: boolean;
}

export interface StudyPreferences extends StudyChoices {
  placement: BoxPlacement;
  keys: StudyKeys;
  highlightLevel: HighlightSetting;
}

export type PreferenceStorage = Pick<typeof browser.storage.local, 'get' | 'set' | 'onChanged'>;

export const DEFAULT_PREFERENCES: StudyPreferences = {
  speed: 1,
  autoPause: false,
  blurred: false,
  placement: DEFAULT_PLACEMENT,
  keys: DEFAULT_KEYS,
  highlightLevel: 2000,
};

const fraction = () => z.number().check(z.gte(0), z.lte(1));

const SCHEMAS = {
  speed: z.number().check(z.gte(MIN_SPEED), z.lte(MAX_SPEED)),
  autoPause: z.boolean(),
  blurred: z.boolean(),
  placement: z.object({ x: fraction(), y: fraction(), edge: z.enum(['top', 'bottom']) }),
  highlightLevel: z.union([z.literal(HIGHLIGHT_LEVELS), z.literal('off')]),
};

const KEYS_SCHEMA = z.partialRecord(
  z.enum(STUDY_COMMANDS),
  z.object({ key: z.string(), shift: z.boolean() }),
);

const STORED_KEYS = [...Object.keys(SCHEMAS), 'keys'];

export class StudyPreferenceStore {
  private constructor(
    private readonly storageArea: PreferenceStorage,
    private preferences: StudyPreferences,
    readonly readFailed = false,
  ) {}

  static async load(storageArea: PreferenceStorage): Promise<StudyPreferenceStore> {
    let stored: Record<string, unknown>;
    try {
      stored = await storageArea.get(STORED_KEYS);
    } catch (error) {
      logger.error('Could not read the study preferences', error);
      return new StudyPreferenceStore(storageArea, DEFAULT_PREFERENCES, true);
    }
    return new StudyPreferenceStore(storageArea, {
      speed: read('speed', stored),
      autoPause: read('autoPause', stored),
      blurred: read('blurred', stored),
      placement: read('placement', stored),
      keys: readKeys(stored.keys),
      highlightLevel: read('highlightLevel', stored),
    });
  }

  get current(): StudyPreferences {
    return this.preferences;
  }

  async save(change: Partial<StudyPreferences>): Promise<void> {
    await this.storageArea.set(change);
    this.preferences = { ...this.preferences, ...change };
  }

  followKeys(onKeys: (keys: StudyKeys) => void, signal: AbortSignal): void {
    this.follow('keys', readKeys, onKeys, signal);
  }

  followHighlightLevel(onLevel: (level: HighlightSetting) => void, signal: AbortSignal): void {
    const readLevel = (stored: unknown) =>
      read('highlightLevel', stored == null ? {} : { highlightLevel: stored });
    this.follow('highlightLevel', readLevel, onLevel, signal);
  }

  remember(change: Partial<StudyPreferences>): void {
    this.preferences = { ...this.preferences, ...change };
    this.storageArea.set(change).catch((error: unknown) => {
      logger.error('Could not save the study preferences', error);
    });
  }

  private follow<Key extends 'keys' | 'highlightLevel'>(
    key: Key,
    readValue: (stored: unknown) => StudyPreferences[Key],
    onValue: (value: StudyPreferences[Key]) => void,
    signal: AbortSignal,
  ): void {
    const listener = (changes: Record<string, { newValue?: unknown } | undefined>): void => {
      if (!(key in changes)) return;
      const value = readValue(changes[key]?.newValue);
      this.preferences = { ...this.preferences, [key]: value };
      onValue(value);
    };
    this.storageArea.onChanged.addListener(listener);
    signal.addEventListener('abort', () => {
      this.storageArea.onChanged.removeListener(listener);
    });
  }
}

function readKeys(stored: unknown): StudyKeys {
  if (stored === undefined) return DEFAULT_KEYS;
  const parsed = KEYS_SCHEMA.safeParse(stored);
  if (!parsed.success) {
    logger.error('Ignored invalid stored keys', parsed.error);
    return DEFAULT_KEYS;
  }
  const keys = { ...DEFAULT_KEYS, ...parsed.data };
  const problem = keysProblem(keys);
  if (problem) {
    logger.error('Ignored stored keys that clash', problem);
    return DEFAULT_KEYS;
  }
  return keys;
}

function read<Key extends keyof typeof SCHEMAS>(
  key: Key,
  stored: Record<string, unknown>,
): StudyPreferences[Key] {
  if (!(key in stored)) return DEFAULT_PREFERENCES[key];
  const value = SCHEMAS[key].safeParse(stored[key]);
  if (value.success) return value.data as StudyPreferences[Key];
  logger.error(`Ignored an invalid stored ${key}`, value.error);
  return DEFAULT_PREFERENCES[key];
}
