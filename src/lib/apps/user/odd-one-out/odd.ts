import { create_rng } from "$lib/core/utils/random";
import { z } from "zod";
import { hex_lch, lch_hex } from "../color-recall/color";
import { sub_seed } from "../color-recall/seed";

export const ODD_MS = 60_000;
export const MISS_PENALTY_MS = 3_000;
export const MAX_GRID = 9;

export function grid_size(level: number): number {
  return Math.min(MAX_GRID, 2 + Math.floor(level / 2));
}

/** The odd tile's OKLCH lightness offset, in L percent; chroma offsets use 0.6 × this / 100. */
export function difference(level: number): number {
  return Math.max(2.5, 18 * Math.pow(0.86, level));
}

export interface OddRound {
  size: number;
  base: string;
  odd_color: string;
  odd: number;
}

// One stream per round, keyed by the hits so far: a miss costs time, not the next board, so a daily is the same for everyone.
export function odd_round(seed: number, level: number): OddRound {
  const rng = create_rng(sub_seed(seed, level));
  const size = grid_size(level);
  const base = lch_hex({ l: 45 + rng() * 35, c: 0.05 + rng() * 0.13, h: rng() * 360 });
  const lch = hex_lch(base);
  const offset = difference(level);
  const by_chroma = lch.c >= 0.09 && rng() < 0.35;
  // Less chroma at the same lightness and hue always stays in sRGB, so the offset survives gamut mapping.
  const odd_color = by_chroma
    ? lch_hex({ ...lch, c: Math.max(0, lch.c - (offset * 0.6) / 100) })
    : lch_hex({ ...lch, l: lch.l > 62 ? lch.l - offset : lch.l + offset });
  return { size, base, odd_color, odd: Math.floor(rng() * size * size) };
}

export function remaining_ms(elapsed: number, misses: number): number {
  return Math.max(0, ODD_MS - elapsed - misses * MISS_PENALTY_MS);
}

export const odd_state_schema = z.object({
  hits: z.number().int().nonnegative(),
  misses: z.number().int().nonnegative(),
  ms: z.number().nonnegative(),
  done: z.boolean(),
});
export type OddState = z.infer<typeof odd_state_schema>;
