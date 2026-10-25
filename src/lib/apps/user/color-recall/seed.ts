import { daily_key } from "$kit/games/daily";
import { daily_seed } from "$kit/games/time";
import { LEGACY_ID, type Mode } from "./modes";

/** A day (`YYYY-MM-DD`) plays that day's puzzle; a number is a practice puzzle. */
export type Seed = string | number;

const FIRST_DAY = Date.UTC(2026, 9, 17);

// Each game keeps the seed it had as a mode of Color Games, so a day plays the same puzzle as before the split (ADR-071).
export function resolve_seed(mode: Mode, seed: Seed): number {
  return typeof seed === "string" ? daily_seed(seed, daily_key(LEGACY_ID, mode)) : seed >>> 0;
}

/** The daily's number in a share line: the day the game came out is #1. */
export function puzzle_number(day: string): number {
  const [year, month, date] = day.split("-").map(Number);
  return Math.round((Date.UTC(year, month - 1, date) - FIRST_DAY) / 86_400_000);
}

export function sub_seed(seed: number, part: number): number {
  return (seed ^ Math.imul(part + 1, 0x9e3779b1)) >>> 0;
}
