import { create_rng, shuffle, type Rng } from "$lib/core/utils/random";

export const ALL = 0x1ff;

export interface Run {
  /** The black cell that shows the sum. */
  clue: number;
  across: boolean;
  cells: readonly number[];
  sum: number;
}

export interface Puzzle {
  seed: number;
  /** Clue border included. */
  size: number;
  /** Row-major, 0 for black cells. */
  solution: readonly number[];
  runs: readonly Run[];
  /** Run index per cell, -1 for black cells. */
  across_of: readonly number[];
  down_of: readonly number[];
}

export function bit(digit: number): number {
  return 1 << (digit - 1);
}

const POPCOUNT = Array.from({ length: 512 }, (_, mask) => {
  let count = 0;
  for (let m = mask; m; m &= m - 1) count++;
  return count;
});

export function popcount(mask: number): number {
  return POPCOUNT[mask];
}

export function digits_of(mask: number): number[] {
  const digits: number[] = [];
  for (let digit = 1; digit <= 9; digit++) if (mask & bit(digit)) digits.push(digit);
  return digits;
}

/** `COMBOS[length][sum]`: the digit sets, as masks, that make that sum. */
const COMBOS: number[][][] = Array.from({ length: 10 }, () => Array.from({ length: 46 }, () => []));
for (let mask = 1; mask < 512; mask++) {
  const sum = digits_of(mask).reduce((total, digit) => total + digit, 0);
  COMBOS[POPCOUNT[mask]][sum].push(mask);
}

export function combos(length: number, sum: number): readonly number[] {
  return COMBOS[length]?.[sum] ?? [];
}

export function runs_of(size: number, white: readonly boolean[]): Run[] {
  const runs: Run[] = [];
  for (const across of [true, false]) {
    for (let a = 0; a < size; a++) {
      let start = -1;
      for (let b = 0; b <= size; b++) {
        const index = across ? a * size + b : b * size + a;
        const open = b < size && white[index];
        if (open && start < 0) start = b;
        if (!open && start >= 0) {
          const cells = Array.from({ length: b - start }, (_, k) => (across ? a * size + start + k : (start + k) * size + a));
          const clue = across ? a * size + start - 1 : (start - 1) * size + a;
          runs.push({ clue, across, cells, sum: 0 });
          start = -1;
        }
      }
    }
  }
  return runs;
}

export function from_solution(seed: number, size: number, solution: readonly number[]): Puzzle {
  const runs = runs_of(size, solution.map((digit) => digit > 0));
  const across_of = new Array<number>(size * size).fill(-1);
  const down_of = new Array<number>(size * size).fill(-1);
  runs.forEach((run, index) => {
    run.sum = run.cells.reduce((total, cell) => total + solution[cell], 0);
    for (const cell of run.cells) (run.across ? across_of : down_of)[cell] = index;
  });
  return { seed, size, solution, runs, across_of, down_of };
}

/**
 * Narrows one run's cells to the digits some still-possible combination allows. A combination survives when it holds
 * every placed digit, each cell can take one of its digits, and together the cells can take all of them. A digit every
 * survivor needs that only one cell can take goes in that cell.
 */
function prune_run(domains: Uint16Array, run: Run): -1 | 0 | 1 {
  let fixed = 0;
  for (const cell of run.cells) {
    const mask = domains[cell];
    if (POPCOUNT[mask] === 1) {
      if (fixed & mask) return -1;
      fixed |= mask;
    }
  }
  let allowed = 0;
  let needed = ALL;
  for (const combo of COMBOS[run.cells.length][run.sum]) {
    if ((combo & fixed) !== fixed) continue;
    let union = 0;
    let ok = true;
    for (const cell of run.cells) {
      const mask = domains[cell] & combo;
      if (!mask) {
        ok = false;
        break;
      }
      union |= mask;
    }
    if (!ok || union !== combo) continue;
    allowed |= combo;
    needed &= combo;
  }
  if (!allowed) return -1;

  let changed: 0 | 1 = 0;
  for (const cell of run.cells) {
    const mask = domains[cell];
    let next = mask & allowed;
    if (POPCOUNT[mask] !== 1) next &= ~fixed;
    if (!next) return -1;
    if (next !== mask) {
      domains[cell] = next;
      changed = 1;
    }
  }
  for (let rest = needed & ~fixed; rest; rest &= rest - 1) {
    const digit = rest & -rest;
    let only = -1;
    let count = 0;
    for (const cell of run.cells) {
      if (domains[cell] & digit) {
        count++;
        only = cell;
      }
    }
    if (count === 0) return -1;
    if (count === 1 && domains[only] !== digit) {
      domains[only] = digit;
      changed = 1;
    }
  }
  return changed;
}

export function propagate(domains: Uint16Array, puzzle: Pick<Puzzle, "runs" | "across_of" | "down_of">): boolean {
  const { runs } = puzzle;
  const dirty = new Uint8Array(runs.length).fill(1);
  const queue = runs.map((_, index) => index);
  while (queue.length) {
    const index = queue.pop()!;
    dirty[index] = 0;
    const run = runs[index];
    const before = run.cells.map((cell) => domains[cell]);
    const result = prune_run(domains, run);
    if (result < 0) return false;
    if (!result) continue;
    run.cells.forEach((cell, k) => {
      if (domains[cell] === before[k]) return;
      const other = run.across ? puzzle.down_of[cell] : puzzle.across_of[cell];
      if (!dirty[other]) {
        dirty[other] = 1;
        queue.push(other);
      }
    });
    if (!dirty[index]) {
      dirty[index] = 1;
      queue.push(index);
    }
  }
  return true;
}

export function initial_domains(puzzle: Pick<Puzzle, "size" | "across_of">): Uint16Array {
  const domains = new Uint16Array(puzzle.size * puzzle.size);
  puzzle.across_of.forEach((run, cell) => {
    if (run >= 0) domains[cell] = ALL;
  });
  return domains;
}

export interface Count {
  count: number;
  solutions: number[][];
  /** The node budget ran out, so `count` is a lower bound. */
  aborted: boolean;
}

export function count_solutions(puzzle: Pick<Puzzle, "size" | "runs" | "across_of" | "down_of">, limit = 2, budget = 20000): Count {
  const result: Count = { count: 0, solutions: [], aborted: false };
  const white = puzzle.across_of.flatMap((run, cell) => (run >= 0 ? [cell] : []));
  let nodes = 0;

  function search(domains: Uint16Array) {
    if (result.count >= limit || result.aborted) return;
    if (++nodes > budget) {
      result.aborted = true;
      return;
    }
    if (!propagate(domains, puzzle)) return;
    let best = -1;
    let best_count = 10;
    for (const cell of white) {
      const count = POPCOUNT[domains[cell]];
      if (count > 1 && count < best_count) {
        best = cell;
        best_count = count;
        if (count === 2) break;
      }
    }
    if (best < 0) {
      result.count++;
      result.solutions.push(Array.from(domains, (mask) => (mask ? 31 - Math.clz32(mask) + 1 : 0)));
      return;
    }
    for (let rest = domains[best]; rest; rest &= rest - 1) {
      const next = domains.slice();
      next[best] = rest & -rest;
      search(next);
    }
  }

  search(initial_domains(puzzle));
  return result;
}

/** Long runs have many combinations, which makes them slow to pin down. */
function max_run(size: number): number {
  return size <= 6 ? 5 : size <= 8 ? 6 : 7;
}

/** The interior is (1..size-1)², so a cell's 180° partner is (size - row, size - col). */
function mirror(size: number, index: number): number {
  return (size - Math.floor(index / size)) * size + (size - (index % size));
}

function connected(size: number, white: readonly boolean[]): boolean {
  const start = white.indexOf(true);
  if (start < 0) return false;
  const seen = new Uint8Array(size * size);
  const stack = [start];
  seen[start] = 1;
  let count = 0;
  while (stack.length) {
    const cell = stack.pop()!;
    count++;
    const col = cell % size;
    for (const next of [cell - size, cell + size, col > 0 ? cell - 1 : -1, col < size - 1 ? cell + 1 : -1]) {
      if (next < 0 || next >= size * size || !white[next] || seen[next]) continue;
      seen[next] = 1;
      stack.push(next);
    }
  }
  return count === white.filter(Boolean).length;
}

/** A white cell left alone in a run would have no clue, so it goes black too when `cascade` allows. */
function black_out(size: number, white: readonly boolean[], cell: number, cascade: boolean): boolean[] | null {
  const next = [...white];
  const black = (index: number) => {
    next[index] = false;
    next[mirror(size, index)] = false;
  };
  black(cell);
  for (;;) {
    const single = runs_of(size, next).find((run) => run.cells.length === 1);
    if (!single) break;
    if (!cascade) return null;
    black(single.cells[0]);
  }
  return connected(size, next) ? next : null;
}

/** Symmetric under a half turn, like printed kakuro, with the white cells connected. */
export function random_layout(size: number, rng: Rng): boolean[] | null {
  let white = Array.from({ length: size * size }, (_, index) => index >= size && index % size > 0);
  const interior = (size - 1) * (size - 1);
  const target = Math.round(interior * (BLACK + rng() * 0.06));
  const cells = shuffle(
    white.flatMap((open, index) => (open && index <= mirror(size, index) ? [index] : [])),
    rng
  );
  for (const cell of cells) {
    if (interior - white.filter(Boolean).length >= target) break;
    if (white[cell]) white = black_out(size, white, cell, false) ?? white;
  }
  const limit = max_run(size);
  for (let pass = 0; pass < 20; pass++) {
    const long = runs_of(size, white).find((run) => run.cells.length > limit);
    if (!long) return white;
    const inner = shuffle(long.cells.slice(1, -1), rng);
    const split =
      inner.map((cell) => black_out(size, white, cell, false)).find(Boolean) ??
      inner.map((cell) => black_out(size, white, cell, true)).find(Boolean);
    if (!split) return null;
    white = split;
  }
  return null;
}

type Shape = Pick<Puzzle, "runs" | "across_of" | "down_of">;

/**
 * Digits for the `open` cells on top of `base`. Draws are weighted towards digits far from 5, and towards finishing a
 * run on a sum with few combinations: 3-in-2 or 24-in-3 are what give reasoning a foothold.
 */
function fill(shape: Shape, base: readonly number[], open: readonly number[], rng: Rng): number[] | null {
  const grid = [...base];
  const is_open = new Uint8Array(base.length);
  for (const cell of open) is_open[cell] = 1;
  const used = new Uint16Array(shape.runs.length);
  const left = new Int8Array(shape.runs.length);
  const sum = new Int16Array(shape.runs.length);
  shape.runs.forEach((run, index) => {
    for (const cell of run.cells) {
      if (is_open[cell]) left[index]++;
      else {
        used[index] |= bit(grid[cell]);
        sum[index] += grid[cell];
      }
    }
  });

  const weight = (digit: number, a: number, d: number) => {
    let w = Math.abs(digit - 5) + 1;
    for (const run of [a, d]) {
      if (left[run] === 1) w /= COMBOS[shape.runs[run].cells.length][sum[run] + digit].length;
    }
    return w;
  };

  let nodes = 0;
  function place(k: number): boolean {
    if (k === open.length) return true;
    if (++nodes > 3000) return false;
    const cell = open[k];
    const a = shape.across_of[cell];
    const d = shape.down_of[cell];
    const order = digits_of(ALL & ~used[a] & ~used[d])
      .map((digit) => ({ digit, key: rng() ** (1 / weight(digit, a, d)) }))
      .sort((x, y) => y.key - x.key);
    for (const { digit } of order) {
      const mask = bit(digit);
      grid[cell] = digit;
      used[a] |= mask;
      used[d] |= mask;
      left[a]--;
      left[d]--;
      sum[a] += digit;
      sum[d] += digit;
      if (place(k + 1)) return true;
      used[a] &= ~mask;
      used[d] &= ~mask;
      left[a]++;
      left[d]++;
      sum[a] -= digit;
      sum[d] -= digit;
    }
    return false;
  }
  return place(0) ? grid : null;
}

export function unresolved(puzzle: Puzzle): number[] {
  const domains = initial_domains(puzzle);
  propagate(domains, puzzle);
  return puzzle.across_of.flatMap((run, cell) => (run >= 0 && popcount(domains[cell]) > 1 ? [cell] : []));
}

const BLACK = 0.18;
const STEPS = 100;

/**
 * Hill-climbs a random fill: while propagation leaves cells open, one run through an open cell is re-drawn, kept when
 * it leaves no more open than before. A grid propagation finishes has one solution and never needs a guess. Random fills
 * alone almost never do; this converges in a few dozen steps.
 */
export function generate(size: number, seed: number): Puzzle {
  const rng = create_rng(seed);
  for (;;) {
    const white = random_layout(size, rng);
    if (!white) continue;
    const shape = from_solution(seed, size, white.map((open) => (open ? 1 : 0)));
    const grid = fill(shape, shape.solution.map(() => 0), white.flatMap((open, index) => (open ? [index] : [])), rng);
    if (!grid) continue;
    let puzzle = from_solution(seed, size, grid);
    let open = unresolved(puzzle);
    for (let step = 0; step < STEPS && open.length; step++) {
      const cell = open[Math.floor(rng() * open.length)];
      const run = puzzle.runs[rng() < 0.5 ? puzzle.across_of[cell] : puzzle.down_of[cell]];
      const next = fill(puzzle, puzzle.solution, run.cells, rng);
      if (!next) continue;
      const candidate = from_solution(seed, size, next);
      const still = unresolved(candidate);
      if (still.length <= open.length) {
        puzzle = candidate;
        open = still;
      }
    }
    if (!open.length) return puzzle;
  }
}

/**
 * The next digit reasoning gives from `values` (which must all be right), one propagation round at a time so the hint
 * is a step the player could see, not the end of a long chain.
 */
export function deduce(puzzle: Puzzle, values: readonly number[]): { cell: number; digit: number } | null {
  const domains = initial_domains(puzzle);
  values.forEach((digit, cell) => {
    if (digit) domains[cell] = bit(digit);
  });
  const empty = (cell: number) => puzzle.across_of[cell] >= 0 && !values[cell];
  for (let round = 0; round < 100; round++) {
    let changed = false;
    for (const run of puzzle.runs) {
      const result = prune_run(domains, run);
      if (result < 0) return null;
      if (result) changed = true;
    }
    const cell = puzzle.across_of.findIndex((_, index) => empty(index) && POPCOUNT[domains[index]] === 1);
    if (cell >= 0) return { cell, digit: 32 - Math.clz32(domains[cell]) };
    if (!changed) return null;
  }
  return null;
}
