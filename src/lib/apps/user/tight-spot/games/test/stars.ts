import type { LevelStars } from "../../core/track";

export const LEVEL_COUNT = 12;
// The first three are the hand-made routes, saved under their names since before levels.
const HAND = ["market", "station", "school"];

export function level_key(level: number): string {
  return HAND[level - 1] ?? `level-${level}`;
}

export interface Graded {
  passed: boolean;
  minors: number;
}

export function test_stars(result: Graded | undefined): number {
  if (!result?.passed) return 0;
  return result.minors === 0 ? 3 : result.minors <= 5 ? 2 : 1;
}

export function level_stars(best: Readonly<Record<string, Graded>>): LevelStars {
  const levels: LevelStars = {};
  for (let level = 1; level <= LEVEL_COUNT; level++) {
    const stars = test_stars(best[level_key(level)]);
    if (stars > 0) levels[level] = stars;
  }
  return levels;
}
