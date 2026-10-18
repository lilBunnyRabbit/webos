import { create_rng, random_int, type Rng } from "$lib/core/utils/random";
import { z } from "zod";
import { color_difference, hsb_hex, wrap_hue, type Hsb } from "./color";
import { Level } from "./modes";
import { sub_seed } from "./seed";

export const ROUNDS = 5;
export const ROUND_MAX = 10;
export const MEMORISE_MS: Record<Level, number> = { [Level.EASY]: 5000, [Level.HARD]: 2000 };
export const MIN_START_HUE_GAP = 60;

export interface RecallRound {
  target: Hsb;
  hex: string;
  start: Hsb;
}

// Dialed's ranges: near-grey and near-black targets are no fun to rebuild.
function random_target(rng: Rng): Hsb {
  return { h: random_int(0, 359, rng), s: random_int(15, 100, rng), b: random_int(15, 100, rng) };
}

export function start_guess(target: Hsb, rng: Rng): Hsb {
  const offset = MIN_START_HUE_GAP + Math.floor(rng() * (360 - 2 * MIN_START_HUE_GAP + 1));
  return { h: wrap_hue(target.h + offset), s: random_int(15, 100, rng), b: random_int(15, 100, rng) };
}

export function recall_rounds(seed: number): RecallRound[] {
  const targets = create_rng(seed);
  const starts = create_rng(sub_seed(seed, 1));
  return Array.from({ length: ROUNDS }, () => {
    const target = random_target(targets);
    return { target, hex: hsb_hex(target), start: start_guess(target, starts) };
  });
}

/** Dialed's curve: 10 for a match, 5 at ΔE00 25.25, falling off from there. */
export function round_score(target: string, guess: string): number {
  const delta = color_difference(target, guess);
  const raw = ROUND_MAX / (1 + Math.pow(delta / 25.25, 1.55));
  return Math.round(Math.min(ROUND_MAX, Math.max(0, raw)) * 100) / 100;
}

export function total_score(scores: readonly number[]): number {
  return Math.round(scores.reduce((sum, score) => sum + score, 0) * 100) / 100;
}

/** The guesses so far; the targets replay from the seed. `shown` means the current round's colour was already on screen. */
export const recall_state_schema = z.object({
  guesses: z.array(z.string().regex(/^#[0-9a-f]{6}$/)).max(ROUNDS),
  shown: z.boolean(),
  ms: z.number().nonnegative(),
});
export type RecallState = z.infer<typeof recall_state_schema>;
