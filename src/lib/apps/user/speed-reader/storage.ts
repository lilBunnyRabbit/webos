import { z } from "zod";
import { DEFAULT_PAUSES, MAX_PAUSE_MS, MAX_WPM, MIN_WPM, NO_PAUSES, type PauseSettings } from "./timeline";

export const MAX_POSITIONS = 50;
export const MAX_GHOST_WORDS = 5;

export interface ReaderSettings {
  wpm: number;
  ghost_words: number;
  pauses: boolean;
  sentence_pause_ms: number;
}

export const DEFAULT_SETTINGS: ReaderSettings = {
  wpm: 300,
  ghost_words: 3,
  pauses: true,
  sentence_pause_ms: DEFAULT_PAUSES.sentence_ms,
};

export const settings_schema = z.object({
  wpm: z.number().int().min(MIN_WPM).max(MAX_WPM),
  ghost_words: z.number().int().min(0).max(MAX_GHOST_WORDS),
  pauses: z.boolean(),
  sentence_pause_ms: z.number().int().min(0).max(MAX_PAUSE_MS),
});

export function pause_settings(settings: ReaderSettings): PauseSettings {
  return settings.pauses ? { ...DEFAULT_PAUSES, sentence_ms: settings.sentence_pause_ms } : NO_PAUSES;
}

export interface ReadingPosition {
  path: string;
  index: number;
}

export const positions_schema = z.array(z.object({ path: z.string(), index: z.number().int().nonnegative() }));

export function remember_position(
  positions: ReadingPosition[],
  path: string,
  index: number,
  cap = MAX_POSITIONS
): ReadingPosition[] {
  return [{ path, index }, ...positions.filter((entry) => entry.path !== path)].slice(0, cap);
}

export function find_position(positions: ReadingPosition[], path: string): number | null {
  return positions.find((entry) => entry.path === path)?.index ?? null;
}

export function clamp_int(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : min;
}
