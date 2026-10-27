import { create_rng, shuffle, type Rng } from "$lib/core/utils/random";
import { z } from "zod";
import { lch_hex, type Lch } from "../color-recall/color";
import { Level } from "../color-recall/modes";
import { sub_seed } from "../color-recall/seed";

export const Locks = { BORDER: "border", CORNERS: "corners" } as const;
export type Locks = (typeof Locks)[keyof typeof Locks];

export interface SortConfig {
  width: number;
  height: number;
  locks: Locks;
}

export const SORT_CONFIGS: Record<Level, SortConfig> = {
  [Level.EASY]: { width: 5, height: 6, locks: Locks.BORDER },
  [Level.HARD]: { width: 7, height: 8, locks: Locks.CORNERS },
};

export interface SortPuzzle {
  width: number;
  height: number;
  colors: string[];
  anchors: boolean[];
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mix = (a: Lch, b: Lch, t: number): Lch => ({ l: lerp(a.l, b.l, t), c: lerp(a.c, b.c, t), h: lerp(a.h, b.h, t) });

// Corner hues are built by adding offsets under 180°, so plain interpolation of the unwrapped hue is the short way round.
function corners(rng: Rng): [Lch, Lch, Lch, Lch] {
  const hue = rng() * 360;
  const across = 50 + rng() * 70;
  const down = (40 + rng() * 60) * (rng() < 0.5 ? -1 : 1);
  const light = rng() < 0.5;
  const [top, bottom] = light ? [86, 46] : [48, 84];
  return [
    { l: top, c: 0.1 + rng() * 0.04, h: hue },
    { l: top - 8, c: 0.14 + rng() * 0.04, h: hue + across },
    { l: bottom + 6, c: 0.12 + rng() * 0.04, h: hue + down },
    { l: bottom, c: 0.11 + rng() * 0.04, h: hue + across + down },
  ];
}

function anchors_for({ width, height, locks }: SortConfig): boolean[] {
  return Array.from({ length: width * height }, (_, index) => {
    const row = Math.floor(index / width);
    const col = index % width;
    const edge_row = row === 0 || row === height - 1;
    const edge_col = col === 0 || col === width - 1;
    if (edge_row && edge_col) return true;
    return locks === Locks.BORDER && (edge_row || edge_col) && (row + col) % 2 === 0;
  });
}

export function sort_puzzle(seed: number, config: SortConfig): SortPuzzle {
  const rng = create_rng(seed);
  const [top_left, top_right, bottom_left, bottom_right] = corners(rng);
  const { width, height } = config;
  const colors = Array.from({ length: width * height }, (_, index) => {
    const u = (index % width) / (width - 1);
    const v = Math.floor(index / width) / (height - 1);
    return lch_hex(mix(mix(top_left, top_right, u), mix(bottom_left, bottom_right, u), v));
  });
  return { width, height, colors, anchors: anchors_for(config) };
}

export function is_solved(order: readonly number[], colors: readonly string[]): boolean {
  return order.every((tile, position) => colors[tile] === colors[position]);
}

/** `order[position]` is the tile shown there. Anchors stay put; every free tile leaves its place when it can. */
export function scramble(puzzle: SortPuzzle, seed: number): number[] {
  const rng = create_rng(sub_seed(seed, 1));
  const free = puzzle.anchors.flatMap((anchor, index) => (anchor ? [] : [index]));
  const order = puzzle.colors.map((_, index) => index);
  if (free.length < 2) return order;
  for (let attempt = 0; attempt < 50; attempt++) {
    const moved = shuffle([...free], rng);
    if (moved.some((tile, at) => tile === free[at]) && attempt < 49) continue;
    free.forEach((position, at) => (order[position] = moved[at]));
    if (!is_solved(order, puzzle.colors)) break;
  }
  return order;
}

export function swap(order: readonly number[], anchors: readonly boolean[], a: number, b: number): number[] | null {
  if (a === b || anchors[a] || anchors[b] || order[a] === undefined || order[b] === undefined) return null;
  const next = [...order];
  [next[a], next[b]] = [next[b], next[a]];
  return next;
}

export const sort_state_schema = z.object({
  order: z.array(z.number().int().nonnegative()),
  moves: z.number().int().nonnegative(),
  ms: z.number().nonnegative(),
});
export type SortState = z.infer<typeof sort_state_schema>;

export function valid_order(order: readonly number[], puzzle: SortPuzzle): boolean {
  if (order.length !== puzzle.colors.length) return false;
  const seen = new Set(order);
  return seen.size === order.length && order.every((tile, position) => tile < order.length && (!puzzle.anchors[position] || tile === position));
}

/** The fewest swaps that put every tile home: one fewer than each cycle of the scramble is long. */
export function fewest_swaps(order: readonly number[]): number {
  const seen = new Uint8Array(order.length);
  let swaps = 0;
  for (let start = 0; start < order.length; start++) {
    let length = 0;
    for (let at = start; !seen[at]; at = order[at]) {
      seen[at] = 1;
      length++;
    }
    if (length) swaps += length - 1;
  }
  return swaps;
}
