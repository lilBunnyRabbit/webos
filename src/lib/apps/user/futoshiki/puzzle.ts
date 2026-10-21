import { across_cells, down_cells } from "$kit/games/grid";
import { create_rng, shuffle, type Rng } from "$lib/core/utils/random";

export const Relation = { NONE: 0, LESS: 1, GREATER: 2 } as const;
export type Relation = (typeof Relation)[keyof typeof Relation];

export interface Puzzle {
  seed: number;
  size: number;
  solution: readonly number[];
  givens: readonly number[];
  /** `across[r * (size - 1) + c]` relates (r, c) to (r, c + 1). */
  across: readonly Relation[];
  /** `down[r * size + c]` relates (r, c) to (r + 1, c). */
  down: readonly Relation[];
}

export type Clues = Pick<Puzzle, "size" | "givens" | "across" | "down">;

export interface Pair {
  lo: number;
  hi: number;
}

export function pairs_of(clues: Clues): Pair[] {
  const pairs: Pair[] = [];
  const add = (relation: Relation, [a, b]: [number, number]) => {
    if (relation === Relation.LESS) pairs.push({ lo: a, hi: b });
    else if (relation === Relation.GREATER) pairs.push({ lo: b, hi: a });
  };
  clues.across.forEach((relation, index) => add(relation, across_cells(clues.size, index)));
  clues.down.forEach((relation, index) => add(relation, down_cells(clues.size, index)));
  return pairs;
}

export function relation_of(a: number, b: number): Relation {
  return a < b ? Relation.LESS : Relation.GREATER;
}

export function units_of(size: number): number[][] {
  const units: number[][] = [];
  for (let r = 0; r < size; r++) units.push(Array.from({ length: size }, (_, c) => r * size + c));
  for (let c = 0; c < size; c++) units.push(Array.from({ length: size }, (_, r) => r * size + c));
  return units;
}

/** Bit d set while digit d is still possible. */
export type Domains = Uint16Array;

export const single = (mask: number) => mask !== 0 && (mask & (mask - 1)) === 0;
export const highest = (mask: number) => 31 - Math.clz32(mask);
const lowest = (mask: number) => 31 - Math.clz32(mask & -mask);
export const full_mask = (size: number) => ((1 << (size + 1)) - 1) & ~1;

export function digits_of(mask: number): number[] {
  const digits: number[] = [];
  for (let d = 1; mask >> d; d++) if (mask & (1 << d)) digits.push(d);
  return digits;
}

interface Context {
  size: number;
  units: number[][];
  peers: number[][];
  pairs: Pair[];
}

const contexts = new Map<number, Omit<Context, "pairs">>();

function context_of(clues: Clues): Context {
  let base = contexts.get(clues.size);
  if (!base) {
    const units = units_of(clues.size);
    const peers = Array.from({ length: clues.size * clues.size }, (_, index) =>
      [...new Set(units.filter((unit) => unit.includes(index)).flat())].filter((peer) => peer !== index)
    );
    base = { size: clues.size, units, peers };
    contexts.set(clues.size, base);
  }
  return { ...base, pairs: pairs_of(clues) };
}

function initial_domains(clues: Clues, entries?: readonly number[]): Domains {
  const full = full_mask(clues.size);
  return Uint16Array.from(clues.givens, (given, index) => {
    const digit = given || entries?.[index] || 0;
    return digit ? 1 << digit : full;
  });
}

/**
 * One pass of the deductions a person makes: a placed digit leaves its row and column; a digit with one place left
 * in a row or column goes there; a sign trims each side to what the other side allows, which, repeated, carries
 * bounds along chains of signs. Null on a contradiction, else whether anything changed.
 */
function round(ctx: Context, domains: Domains): boolean | null {
  let changed = false;
  for (let index = 0; index < domains.length; index++) {
    const mask = domains[index];
    if (!single(mask)) continue;
    for (const peer of ctx.peers[index]) {
      if (!(domains[peer] & mask)) continue;
      domains[peer] &= ~mask;
      if (!domains[peer]) return null;
      changed = true;
    }
  }
  for (const unit of ctx.units) {
    for (let d = 1; d <= ctx.size; d++) {
      const bit = 1 << d;
      let place = -1;
      let count = 0;
      for (const index of unit) {
        if (domains[index] & bit) {
          place = index;
          count++;
        }
      }
      if (!count) return null;
      if (count === 1 && domains[place] !== bit) {
        domains[place] = bit;
        changed = true;
      }
    }
  }
  for (const { lo, hi } of ctx.pairs) {
    const next_lo = domains[lo] & ((1 << highest(domains[hi])) - 1);
    const next_hi = domains[hi] & ~((1 << (lowest(domains[lo]) + 1)) - 1);
    if (!next_lo || !next_hi) return null;
    if (next_lo !== domains[lo] || next_hi !== domains[hi]) changed = true;
    domains[lo] = next_lo;
    domains[hi] = next_hi;
  }
  return changed;
}

function propagate(ctx: Context, domains: Domains): boolean {
  for (;;) {
    const changed = round(ctx, domains);
    if (changed === null) return false;
    if (!changed) return true;
  }
}

export function deduce(clues: Clues, entries?: readonly number[]): Domains | null {
  const domains = initial_domains(clues, entries);
  return propagate(context_of(clues), domains) ? domains : null;
}

export function logic_solves(clues: Clues): boolean {
  return deduce(clues)?.every(single) ?? false;
}

/**
 * The empty cell that the fewest rounds of deduction pin down, from the clues and the player's entries: the step a
 * person would most likely spot next. Null when the entries contradict the clues or deduction stalls.
 */
export function next_deduction(clues: Clues, entries: readonly number[]): { index: number; digit: number } | null {
  const ctx = context_of(clues);
  const domains = initial_domains(clues, entries);
  const open = (index: number) => !clues.givens[index] && !entries[index];
  for (;;) {
    const found = domains.findIndex((mask, index) => open(index) && single(mask));
    if (found >= 0) return { index: found, digit: highest(domains[found]) };
    if (!round(ctx, domains)) return null;
  }
}

export function count_solutions(clues: Clues, limit = 2): number {
  const ctx = context_of(clues);
  const search = (domains: Domains, wanted: number): number => {
    if (!propagate(ctx, domains)) return 0;
    let best = -1;
    let best_count = Infinity;
    for (let index = 0; index < domains.length; index++) {
      if (single(domains[index])) continue;
      const count = digits_of(domains[index]).length;
      if (count < best_count) [best, best_count] = [index, count];
    }
    if (best < 0) return 1;
    let found = 0;
    for (const d of digits_of(domains[best])) {
      const next = domains.slice();
      next[best] = 1 << d;
      found += search(next, wanted - found);
      if (found >= wanted) break;
    }
    return found;
  };
  return search(initial_domains(clues), limit);
}

export function latin_square(size: number, rng: Rng): number[] {
  const grid = new Array<number>(size * size).fill(0);
  const rows = new Uint16Array(size);
  const cols = new Uint16Array(size);
  const fill = (index: number): boolean => {
    if (index === grid.length) return true;
    const r = Math.floor(index / size);
    const c = index % size;
    for (const d of shuffle(Array.from({ length: size }, (_, i) => i + 1), rng)) {
      const bit = 1 << d;
      if ((rows[r] | cols[c]) & bit) continue;
      grid[index] = d;
      rows[r] |= bit;
      cols[c] |= bit;
      if (fill(index + 1)) return true;
      rows[r] &= ~bit;
      cols[c] &= ~bit;
    }
    return false;
  };
  fill(0);
  return grid;
}

/**
 * Starts from every sign and every digit, then takes clues away in random order, digits first, keeping a removal
 * only while deduction alone still finishes the grid. What's left is minimal, carried mostly by signs, and solvable
 * without guessing, which also makes the solution unique: deduction never rules out a digit that could be right.
 * A few candidates are cheap, so the sparsest one wins.
 */
export function generate(size: number, seed: number): Puzzle {
  const rng = create_rng(seed);
  let best: Puzzle | null = null;
  let best_weight = Infinity;
  for (let attempt = 0; attempt < CANDIDATES; attempt++) {
    const puzzle = { seed, ...candidate(size, rng) };
    const weight = clue_weight(puzzle);
    if (weight < best_weight) [best, best_weight] = [puzzle, weight];
  }
  return best!;
}

const CANDIDATES = 6;

/** A given digit gives away more than a sign, so it weighs more. */
export function clue_weight(clues: Clues): number {
  const signs = [...clues.across, ...clues.down].filter((relation) => relation !== Relation.NONE).length;
  return clues.givens.filter(Boolean).length * 3 + signs;
}

function candidate(size: number, rng: Rng): Omit<Puzzle, "seed"> {
  const solution = latin_square(size, rng);
  const relations = (cells: (index: number) => [number, number]) =>
    Array.from({ length: size * (size - 1) }, (_, index): Relation => {
      const [a, b] = cells(index);
      return relation_of(solution[a], solution[b]);
    });
  const clues = {
    size,
    givens: [...solution],
    across: relations((index) => across_cells(size, index)),
    down: relations((index) => down_cells(size, index)),
  };

  for (const index of shuffle([...clues.givens.keys()], rng)) {
    const kept = clues.givens[index];
    clues.givens[index] = 0;
    if (!logic_solves(clues)) clues.givens[index] = kept;
  }
  const signs = [
    ...clues.across.map((_, index) => ["across", index] as const),
    ...clues.down.map((_, index) => ["down", index] as const),
  ];
  for (const [axis, index] of shuffle(signs, rng)) {
    const kept = clues[axis][index];
    clues[axis][index] = Relation.NONE;
    if (!logic_solves(clues)) clues[axis][index] = kept;
  }
  return { solution, ...clues };
}
