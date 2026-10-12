import { create_rng, type Rng } from "$lib/core/utils/random";

/** What line logic knows about a cell. */
export const Known = { UNKNOWN: 0, FILLED: 1, EMPTY: 2 } as const;
export type Known = (typeof Known)[keyof typeof Known];

export interface Puzzle {
  seed: number;
  width: number;
  height: number;
  /** Row-major, `true` = filled. */
  solution: readonly boolean[];
  rows: readonly (readonly number[])[];
  cols: readonly (readonly number[])[];
}

/** Run lengths of a line; an empty line has no runs. */
export function clue_of(line: readonly boolean[]): number[] {
  const runs: number[] = [];
  let run = 0;
  for (const filled of line) {
    if (filled) run++;
    else if (run) {
      runs.push(run);
      run = 0;
    }
  }
  if (run) runs.push(run);
  return runs;
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
 * `before[j][i]`: the first j runs fit in cells [0, i) with cell i - 1 not part of a run that continues.
 * `after[j][i]`: runs j.. fit in cells [i, n). A cell can be empty when some split puts j runs before it and
 * the rest after; it can be filled when some run can sit on it.
 */
export function solve_line(clue: readonly number[], known: readonly Known[]): Known[] | null {
  const n = known.length;
  const k = clue.length;
  const can_empty = (i: number) => known[i] !== Known.FILLED;

  // empties[i] = count of cells known EMPTY in [0, i), so "a run fits at [s, e)" is one subtraction.
  const empties = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) empties[i + 1] = empties[i] + (known[i] === Known.EMPTY ? 1 : 0);
  const fits = (s: number, e: number) => s >= 0 && e <= n && empties[e] - empties[s] === 0;

  const before = Array.from({ length: k + 1 }, () => new Uint8Array(n + 1));
  before[0][0] = 1;
  for (let i = 1; i <= n; i++) {
    for (let j = 0; j <= k; j++) {
      if (can_empty(i - 1) && before[j][i - 1]) {
        before[j][i] = 1;
        continue;
      }
      if (j === 0) continue;
      const s = i - clue[j - 1];
      if (!fits(s, i)) continue;
      if (s === 0 ? j === 1 : can_empty(s - 1) && before[j - 1][s - 1]) before[j][i] = 1;
    }
  }

  const after = Array.from({ length: k + 1 }, () => new Uint8Array(n + 2));
  after[k][n] = 1;
  after[k][n + 1] = 1;
  for (let i = n - 1; i >= 0; i--) {
    for (let j = k; j >= 0; j--) {
      if (can_empty(i) && after[j][i + 1]) {
        after[j][i] = 1;
        continue;
      }
      if (j === k) continue;
      const e = i + clue[j];
      if (!fits(i, e)) continue;
      if (e === n ? j === k - 1 : can_empty(e) && after[j + 1][e + 1]) after[j][i] = 1;
    }
  }
  if (!before[k][n]) return null;

  const empty_ok = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (!can_empty(i)) continue;
    for (let j = 0; j <= k; j++) {
      if (before[j][i] && after[j][i + 1]) {
        empty_ok[i] = 1;
        break;
      }
    }
  }

  const cover = new Int32Array(n + 1);
  for (let j = 0; j < k; j++) {
    const len = clue[j];
    for (let s = 0; s + len <= n; s++) {
      const e = s + len;
      if (!fits(s, e)) continue;
      const left = s === 0 ? j === 0 : can_empty(s - 1) && before[j][s - 1] === 1;
      if (!left) continue;
      const right = e === n ? j === k - 1 : can_empty(e) && after[j + 1][e + 1] === 1;
      if (!right) continue;
      cover[s]++;
      cover[e]--;
    }
  }

  const result: Known[] = [];
  let depth = 0;
  for (let i = 0; i < n; i++) {
    depth += cover[i];
    const fill_ok = depth > 0;
    if (fill_ok && empty_ok[i]) result.push(Known.UNKNOWN);
    else if (fill_ok) result.push(Known.FILLED);
    else if (empty_ok[i]) result.push(Known.EMPTY);
    else return null;
  }
  return result;
}

/**
 * Line-by-line deduction until nothing changes. A puzzle it finishes has exactly one solution and never needs a
 * guess, which is what makes a nonogram fair.
 */
export function solve(
  width: number,
  height: number,
  rows: readonly (readonly number[])[],
  cols: readonly (readonly number[])[],
  start?: readonly Known[]
): Known[] | null {
  const grid: Known[] = start ? [...start] : new Array(width * height).fill(Known.UNKNOWN);
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

/** Noise looks like static; a smoothing pass groups it into shapes, and half the time a mirror makes it a figure. */
function random_grid(width: number, height: number, rng: Rng): boolean[] {
  const density = 0.42 + rng() * 0.12;
  let grid = Array.from({ length: width * height }, () => rng() < density);
  const neighbours = (cells: boolean[], row: number, col: number) => {
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
      return count >= 5 ? true : count <= 2 ? false : filled;
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

export function from_solution(seed: number, width: number, height: number, solution: boolean[]): Puzzle {
  return {
    seed,
    width,
    height,
    solution,
    rows: Array.from({ length: height }, (_, row) => clue_of(row_of(solution, width, row))),
    cols: Array.from({ length: width }, (_, col) => clue_of(col_of(solution, width, height, col))),
  };
}

const MAX_TRIES = 400;

/** Blank lines and lopsided fills make dull puzzles: most of the board solves itself. */
function pleasant(puzzle: Puzzle): boolean {
  const fill = puzzle.solution.filter(Boolean).length / puzzle.solution.length;
  if (fill < 0.4 || fill > 0.68) return false;
  const blank = [...puzzle.rows, ...puzzle.cols].filter((clue) => clue.length === 0).length;
  return blank <= Math.floor((puzzle.width + puzzle.height) / 10);
}

/**
 * Draws grids from the seed until line logic alone solves one. When none does, the closest grid gets the cells logic
 * couldn't settle copied from the solution as filled or empty until it does, so a seed always yields a puzzle.
 */
export function generate(width: number, height: number, seed: number): Puzzle {
  const rng = create_rng(seed);
  let best: { solution: boolean[]; unknown: number } | null = null;
  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    const solution = random_grid(width, height, rng);
    const puzzle = from_solution(seed, width, height, solution);
    if (!pleasant(puzzle)) continue;
    const solved = solve(width, height, puzzle.rows, puzzle.cols);
    const unknown = solved ? solved.filter((cell) => cell === Known.UNKNOWN).length : Infinity;
    if (unknown === 0) return puzzle;
    if (!best || unknown < best.unknown) best = { solution, unknown };
  }
  return settle(seed, width, height, best?.solution ?? random_grid(width, height, rng), rng);
}

/** Flips undecided cells to empty one at a time; emptier lines constrain more, so it converges. */
function settle(seed: number, width: number, height: number, solution: boolean[], rng: Rng): Puzzle {
  const grid = [...solution];
  for (;;) {
    const puzzle = from_solution(seed, width, height, grid);
    const solved = solve(width, height, puzzle.rows, puzzle.cols)!;
    const open = solved.flatMap((cell, index) => (cell === Known.UNKNOWN && grid[index] ? [index] : []));
    if (!open.length) return puzzle;
    grid[open[Math.floor(rng() * open.length)]] = false;
  }
}
