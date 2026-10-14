import { create_rng, type Rng } from "$lib/core/utils/random";

/** Theme tokens a puzzle may paint with. Black and white is one ink: foreground. */
export const Ink = {
  FOREGROUND: "foreground",
  PRIMARY: "primary",
  SUCCESS: "success",
  WARNING: "warning",
  ERROR: "error",
  INFO: "info",
} as const;
export type Ink = (typeof Ink)[keyof typeof Ink];
export const INKS: readonly Ink[] = Object.values(Ink);
export const MAX_COLORS = 4;

export const BW_PALETTE: readonly Ink[] = [Ink.FOREGROUND];
/** Hues far apart in both brand themes (primary sits next to success in dark and next to error in light). */
export const GENERATED_PALETTE: readonly Ink[] = [Ink.INFO, Ink.ERROR, Ink.SUCCESS, Ink.FOREGROUND];

export interface Run {
  length: number;
  color: number;
}
export type Clue = readonly Run[];

/** A picture cell: 0 is empty, 1… a colour. Anything below 1 (a cross) reads as empty. */
export const BLANK = 0;

/** What line logic still allows in a cell, as bits: bit 0 empty, bit c colour c. */
export type Options = number;
export const EMPTY_BIT = 1;
export const color_bit = (color: number): Options => 1 << color;
export const any_of = (colors: number): Options => (1 << (colors + 1)) - 1;
export const is_settled = (options: Options): boolean => options !== 0 && (options & (options - 1)) === 0;
export const settled_value = (options: Options): number => 31 - Math.clz32(options);

export interface Puzzle {
  seed: number;
  width: number;
  height: number;
  palette: readonly Ink[];
  solution: readonly number[];
  rows: readonly Clue[];
  cols: readonly Clue[];
}

export function is_color(palette: readonly Ink[]): boolean {
  return palette.length > 1 || palette[0] !== Ink.FOREGROUND;
}

export function clue_of(line: readonly number[]): Run[] {
  const runs: Run[] = [];
  let run: Run | null = null;
  for (const cell of line) {
    if (cell < 1) run = null;
    else if (run && run.color === cell) run.length++;
    else runs.push((run = { length: 1, color: cell }));
  }
  return runs;
}

export function same_clue(a: Clue, b: Clue): boolean {
  return a.length === b.length && a.every((run, index) => run.length === b[index].length && run.color === b[index].color);
}

export function row_of<T>(cells: readonly T[], width: number, row: number): T[] {
  return cells.slice(row * width, row * width + width);
}

export function col_of<T>(cells: readonly T[], width: number, height: number, col: number): T[] {
  return Array.from({ length: height }, (_, row) => cells[row * width + col]);
}

/**
 * Everything one line's clue forces, given what's already known. Returns null when the line can't be satisfied.
 *
 * Runs of the same colour need an empty cell between them; runs of different colours may touch.
 * `before[j][i]`: the first j runs fit in [0, i) and every cell after the last of them up to i can be empty.
 * `after[j][i]`: runs j.. fit in [i, n), with every cell from i up to run j's start able to be empty.
 * A run can sit at [s, e) when its colour fits there and both sides fit around it; a cell can be empty when some
 * split puts j runs before it and the rest after.
 */
export function solve_line(clue: Clue, known: readonly Options[]): Options[] | null {
  const n = known.length;
  const k = clue.length;
  const can_empty = (i: number) => (known[i] & EMPTY_BIT) !== 0;

  const blocked = new Map<number, Int32Array>();
  for (const { color } of clue) {
    if (blocked.has(color)) continue;
    const prefix = new Int32Array(n + 1);
    const bit = color_bit(color);
    for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + ((known[i] & bit) === 0 ? 1 : 0);
    blocked.set(color, prefix);
  }
  const fits = (j: number, s: number) => {
    const e = s + clue[j].length;
    if (s < 0 || e > n) return false;
    const prefix = blocked.get(clue[j].color)!;
    return prefix[e] - prefix[s] === 0;
  };
  const gap_before = (j: number) => (j > 0 && clue[j - 1].color === clue[j].color ? 1 : 0);

  const before = Array.from({ length: k + 1 }, () => new Uint8Array(n + 1));
  const after = Array.from({ length: k + 1 }, () => new Uint8Array(n + 1));
  const left_ok = (j: number, s: number) => {
    if (j === 0 || gap_before(j) === 0) return before[j][s] === 1;
    return s >= 1 && can_empty(s - 1) && before[j][s - 1] === 1;
  };
  const right_ok = (j: number, e: number) => {
    if (j === k - 1 || gap_before(j + 1) === 0) return after[j + 1][e] === 1;
    return e < n && can_empty(e) && after[j + 1][e + 1] === 1;
  };

  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= k; j++) {
      if (i === 0 && j === 0) before[0][0] = 1;
      else if (i > 0 && before[j][i - 1] && can_empty(i - 1)) before[j][i] = 1;
      else if (j > 0) {
        const s = i - clue[j - 1].length;
        if (fits(j - 1, s) && left_ok(j - 1, s)) before[j][i] = 1;
      }
    }
  }
  if (!before[k][n]) return null;

  for (let i = n; i >= 0; i--) {
    for (let j = k; j >= 0; j--) {
      if (i === n && j === k) after[k][n] = 1;
      else if (i < n && after[j][i + 1] && can_empty(i)) after[j][i] = 1;
      else if (j < k && fits(j, i) && right_ok(j, i + clue[j].length)) after[j][i] = 1;
    }
  }

  const result = new Array<Options>(n).fill(0);
  for (let i = 0; i < n; i++) {
    if (!can_empty(i)) continue;
    for (let j = 0; j <= k; j++) {
      if (before[j][i] && after[j][i + 1]) {
        result[i] = EMPTY_BIT;
        break;
      }
    }
  }

  const cover = new Map<number, Int32Array>();
  for (let j = 0; j < k; j++) {
    const { length, color } = clue[j];
    let diff = cover.get(color);
    if (!diff) cover.set(color, (diff = new Int32Array(n + 1)));
    for (let s = 0; s + length <= n; s++) {
      if (!fits(j, s) || !left_ok(j, s) || !right_ok(j, s + length)) continue;
      diff[s]++;
      diff[s + length]--;
    }
  }
  for (const [color, diff] of cover) {
    let depth = 0;
    for (let i = 0; i < n; i++) {
      depth += diff[i];
      if (depth > 0) result[i] |= color_bit(color);
    }
  }
  return result.some((options) => options === 0) ? null : result;
}

/**
 * Line-by-line deduction until nothing changes. A puzzle it settles completely has exactly one solution and never
 * needs a guess, which is what makes a nonogram fair.
 */
export function solve(
  width: number,
  height: number,
  colors: number,
  rows: readonly Clue[],
  cols: readonly Clue[],
  start?: readonly Options[]
): Options[] | null {
  const grid: Options[] = start ? [...start] : new Array(width * height).fill(any_of(colors));
  const dirty_rows = new Uint8Array(height).fill(1);
  const dirty_cols = new Uint8Array(width).fill(1);
  let changed = true;
  while (changed) {
    changed = false;
    for (let row = 0; row < height; row++) {
      if (!dirty_rows[row]) continue;
      dirty_rows[row] = 0;
      const line = solve_line(rows[row], row_of(grid, width, row));
      if (!line) return null;
      for (let col = 0; col < width; col++) {
        const index = row * width + col;
        if (grid[index] !== line[col]) {
          grid[index] = line[col];
          dirty_cols[col] = 1;
          changed = true;
        }
      }
    }
    for (let col = 0; col < width; col++) {
      if (!dirty_cols[col]) continue;
      dirty_cols[col] = 0;
      const line = solve_line(cols[col], col_of(grid, width, height, col));
      if (!line) return null;
      for (let row = 0; row < height; row++) {
        const index = row * width + col;
        if (grid[index] !== line[row]) {
          grid[index] = line[row];
          dirty_rows[row] = 1;
          changed = true;
        }
      }
    }
  }
  return grid;
}

export const Verdict = {
  LOGIC: "logic",
  /** One solution, but reaching it needs a guess. */
  UNIQUE: "unique",
  MULTIPLE: "multiple",
  NONE: "none",
  UNKNOWN: "unknown",
} as const;
export type Verdict = (typeof Verdict)[keyof typeof Verdict];

export interface Analysis {
  verdict: Verdict;
  /** Up to two solutions found; two for MULTIPLE, so a caller can show where they differ. */
  solutions: number[][];
}

/**
 * Line logic first; where it stalls, guess a cell and propagate, stopping at the second solution, after `budget`
 * guesses or past `deadline` (a `Date.now()` time), so an editor can call it on every change.
 */
export function analyze(
  width: number,
  height: number,
  colors: number,
  rows: readonly Clue[],
  cols: readonly Clue[],
  budget = 4000,
  deadline = Infinity
): Analysis {
  const first = solve(width, height, colors, rows, cols);
  if (!first) return { verdict: Verdict.NONE, solutions: [] };
  if (first.every(is_settled)) return { verdict: Verdict.LOGIC, solutions: [first.map(settled_value)] };

  const solutions: number[][] = [];
  let nodes = 0;
  const search = (grid: Options[]) => {
    if (solutions.length >= 2 || nodes >= budget) return;
    if (++nodes % 16 === 0 && Date.now() > deadline) nodes = budget;
    const solved = solve(width, height, colors, rows, cols, grid);
    if (!solved) return;
    let open = -1;
    let fewest = Infinity;
    for (let index = 0; index < solved.length; index++) {
      if (is_settled(solved[index])) continue;
      const count = bit_count(solved[index]);
      if (count < fewest) [open, fewest] = [index, count];
    }
    if (open < 0) {
      solutions.push(solved.map(settled_value));
      return;
    }
    for (let bit = 1; bit <= solved[open]; bit <<= 1) {
      if (!(solved[open] & bit)) continue;
      const next = [...solved];
      next[open] = bit;
      search(next);
    }
  };
  search(first);
  const verdict =
    solutions.length >= 2
      ? Verdict.MULTIPLE
      : nodes >= budget
        ? Verdict.UNKNOWN
        : solutions.length === 1
          ? Verdict.UNIQUE
          : Verdict.NONE;
  return { verdict, solutions };
}

function bit_count(options: Options): number {
  let count = 0;
  for (let rest = options; rest; rest &= rest - 1) count++;
  return count;
}

export function differences(a: readonly number[], b: readonly number[]): number[] {
  return a.flatMap((cell, index) => (cell !== b[index] ? [index] : []));
}

/**
 * Noise looks like static; a smoothing pass groups it into shapes. Colour comes from a few random centres (each cell
 * takes the nearest one's colour, so colours form patches), and half the time a mirror makes it a figure.
 */
function random_grid(width: number, height: number, colors: number, rng: Rng): number[] {
  const density = 0.42 + rng() * 0.12 + (colors > 1 ? 0.06 : 0);
  let grid: number[] = Array.from({ length: width * height }, () => (rng() < density ? 1 : 0));
  const neighbours = (cells: number[], row: number, col: number) => {
    let count = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const r = row + dy;
        const c = col + dx;
        if (r >= 0 && r < height && c >= 0 && c < width && cells[r * width + c]) count++;
      }
    }
    return count;
  };
  if (width >= 10) {
    grid = grid.map((filled, index) => {
      const count = neighbours(grid, Math.floor(index / width), index % width);
      return count >= 5 ? 1 : count <= 2 ? 0 : filled;
    });
  }
  if (colors > 1) {
    const centres = Array.from({ length: colors * 2 }, (_, index) => ({
      row: rng() * height,
      col: rng() * width,
      color: (index % colors) + 1,
    }));
    grid = grid.map((filled, index) => {
      if (!filled) return 0;
      const row = Math.floor(index / width);
      const col = index % width;
      let nearest = centres[0];
      for (const centre of centres) {
        if ((centre.row - row) ** 2 + (centre.col - col) ** 2 < (nearest.row - row) ** 2 + (nearest.col - col) ** 2) nearest = centre;
      }
      return nearest.color;
    });
  }
  if (rng() < 0.5) {
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < Math.floor(width / 2); col++) {
        grid[row * width + (width - 1 - col)] = grid[row * width + col];
      }
    }
  }
  return grid;
}

export function from_solution(seed: number, width: number, height: number, palette: readonly Ink[], solution: readonly number[]): Puzzle {
  return {
    seed,
    width,
    height,
    palette,
    solution,
    rows: Array.from({ length: height }, (_, row) => clue_of(row_of(solution, width, row))),
    cols: Array.from({ length: width }, (_, col) => clue_of(col_of(solution, width, height, col))),
  };
}

const MAX_TRIES = 400;

/** Blank lines and lopsided fills make dull puzzles: most of the board solves itself. A colour must show up. */
function pleasant(puzzle: Puzzle): boolean {
  const filled = puzzle.solution.filter((cell) => cell > 0).length / puzzle.solution.length;
  if (filled < 0.4 || filled > 0.72) return false;
  for (let color = 1; color <= puzzle.palette.length; color++) {
    if (!puzzle.solution.includes(color)) return false;
  }
  const blank = [...puzzle.rows, ...puzzle.cols].filter((clue) => clue.length === 0).length;
  return blank <= Math.floor((puzzle.width + puzzle.height) / 10);
}

/**
 * Draws grids from the seed until line logic alone solves one. When none does, the closest grid gets cells logic
 * couldn't settle emptied until it does, so a seed always yields a puzzle.
 */
export function generate(width: number, height: number, seed: number, palette: readonly Ink[] = BW_PALETTE): Puzzle {
  const rng = create_rng(seed);
  const colors = palette.length;
  let best: { solution: number[]; unknown: number } | null = null;
  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    const solution = random_grid(width, height, colors, rng);
    const puzzle = from_solution(seed, width, height, palette, solution);
    if (!pleasant(puzzle)) continue;
    const solved = solve(width, height, colors, puzzle.rows, puzzle.cols);
    const unknown = solved ? solved.filter((cell) => !is_settled(cell)).length : Infinity;
    if (unknown === 0) return puzzle;
    if (!best || unknown < best.unknown) best = { solution, unknown };
  }
  return settle(seed, width, height, palette, best?.solution ?? random_grid(width, height, colors, rng), rng);
}

/** Empties undecided cells one at a time; emptier lines constrain more, so it converges. */
function settle(seed: number, width: number, height: number, palette: readonly Ink[], solution: number[], rng: Rng): Puzzle {
  const grid = [...solution];
  for (;;) {
    const puzzle = from_solution(seed, width, height, palette, grid);
    const solved = solve(width, height, palette.length, puzzle.rows, puzzle.cols)!;
    const open = solved.flatMap((cell, index) => (!is_settled(cell) && grid[index] > 0 ? [index] : []));
    if (!open.length) return puzzle;
    grid[open[Math.floor(rng() * open.length)]] = BLANK;
  }
}
