import { create_rng, shuffle, type Rng } from "$lib/core/utils/random";

export interface Puzzle {
  seed: number;
  size: number;
  /** The meadow of each cell, `0` to `size - 1`. */
  regions: readonly number[];
  /** The column of each row's rabbit. */
  solution: readonly number[];
}

export const Cell = { UNKNOWN: 0, EMPTY: 1, RABBIT: 2 } as const;
export type Cell = (typeof Cell)[keyof typeof Cell];

export const UnitKind = { ROW: "row", COL: "col", MEADOW: "meadow" } as const;
export type UnitKind = (typeof UnitKind)[keyof typeof UnitKind];

export interface Unit {
  kind: UnitKind;
  index: number;
  cells: readonly number[];
}

export const Rule = { ONLY: "only", LOCKED: "locked", BLOCKS: "blocks" } as const;
export type Rule = (typeof Rule)[keyof typeof Rule];

/** One step of logic: `cells` (all unknown before it) must hold `mark`, because of `units`. */
export interface Deduction {
  rule: Rule;
  cells: number[];
  mark: Cell;
  units: Unit[];
  within: Unit[];
}

export interface Board {
  size: number;
  regions: readonly number[];
  units: Unit[];
  units_of: number[][];
  around: number[][];
}

export function create_board(size: number, regions: readonly number[]): Board {
  const units: Unit[] = [];
  for (let r = 0; r < size; r++)
    units.push({ kind: UnitKind.ROW, index: r, cells: Array.from({ length: size }, (_, c) => r * size + c) });
  for (let c = 0; c < size; c++)
    units.push({ kind: UnitKind.COL, index: c, cells: Array.from({ length: size }, (_, r) => r * size + c) });
  for (let m = 0; m < size; m++)
    units.push({ kind: UnitKind.MEADOW, index: m, cells: regions.flatMap((region, cell) => (region === m ? [cell] : [])) });
  const units_of = regions.map((region, cell) => [Math.floor(cell / size), size + (cell % size), 2 * size + region]);
  const around = regions.map((_, cell) => {
    const row = Math.floor(cell / size);
    const col = cell % size;
    const cells: number[] = [];
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        const [r, c] = [row + dr, col + dc];
        if ((dr || dc) && r >= 0 && r < size && c >= 0 && c < size) cells.push(r * size + c);
      }
    return cells;
  });
  return { size, regions, units, units_of, around };
}

export function blocked_by(board: Board, cell: number): Set<number> {
  const blocked = new Set<number>(board.around[cell]);
  for (const unit of board.units_of[cell]) for (const other of board.units[unit].cells) blocked.add(other);
  blocked.delete(cell);
  return blocked;
}

/** Up to `limit` solutions, each the column per row. Two is enough to tell a unique puzzle from one that isn't. */
export function solutions(size: number, regions: readonly number[], limit = 2): number[][] {
  const found: number[][] = [];
  const cols = new Array<number>(size);
  const place = (row: number, used_cols: number, used_regions: number): boolean => {
    if (row === size) {
      found.push([...cols]);
      return found.length >= limit;
    }
    for (let c = 0; c < size; c++) {
      if (used_cols & (1 << c)) continue;
      const region = regions[row * size + c];
      if (used_regions & (1 << region)) continue;
      if (row > 0 && Math.abs(cols[row - 1] - c) <= 1) continue;
      cols[row] = c;
      if (place(row + 1, used_cols | (1 << c), used_regions | (1 << region))) return true;
    }
    return false;
  };
  place(0, 0, 0);
  return found;
}

export function count_solutions(size: number, regions: readonly number[], limit = 2): number {
  return solutions(size, regions, limit).length;
}

/** Marks everything a placed rabbit rules out. These are too obvious to count as a step of their own. */
export function settle(board: Board, state: Int8Array): void {
  state.forEach((value, cell) => {
    if (value !== Cell.RABBIT) return;
    for (const other of blocked_by(board, cell)) if (state[other] === Cell.UNKNOWN) state[other] = Cell.EMPTY;
  });
}

function open_units(board: Board, state: Int8Array): Unit[] {
  return board.units.filter((unit) => !unit.cells.some((cell) => state[cell] === Cell.RABBIT));
}

function candidates(unit: Unit, state: Int8Array): number[] {
  return unit.cells.filter((cell) => state[cell] === Cell.UNKNOWN);
}

function popcount(mask: number): number {
  let count = 0;
  for (let m = mask; m; m &= m - 1) count++;
  return count;
}

const line_of: Record<UnitKind, (board: Board, cell: number) => number> = {
  [UnitKind.ROW]: (board, cell) => Math.floor(cell / board.size),
  [UnitKind.COL]: (board, cell) => cell % board.size,
  [UnitKind.MEADOW]: (board, cell) => board.regions[cell],
};

const unit_offset: Record<UnitKind, (size: number) => number> = {
  [UnitKind.ROW]: () => 0,
  [UnitKind.COL]: (size) => size,
  [UnitKind.MEADOW]: (size) => 2 * size,
};

const PAIRS: [UnitKind, UnitKind][] = [
  [UnitKind.MEADOW, UnitKind.ROW],
  [UnitKind.MEADOW, UnitKind.COL],
  [UnitKind.ROW, UnitKind.MEADOW],
  [UnitKind.COL, UnitKind.MEADOW],
  [UnitKind.ROW, UnitKind.COL],
  [UnitKind.COL, UnitKind.ROW],
];

/**
 * When `k` units of one kind (meadows) have all their candidates inside `k` units of another (rows), those rows' `k`
 * rabbits are spoken for, so every other cell of those rows is empty. With `k = 1` it's "this meadow is all in row 3".
 */
function locked(board: Board, state: Int8Array, open: Unit[], min_k: number, max_k: number): Deduction | null {
  const tables = PAIRS.map(([kind, other]) => {
    const groups = open.filter((unit) => unit.kind === kind);
    const masks = groups.map((unit) =>
      candidates(unit, state).reduce((mask, cell) => mask | (1 << line_of[other](board, cell)), 0)
    );
    const lines = new Int32Array(1 << groups.length);
    for (let subset = 1; subset < lines.length; subset++) {
      const low = 31 - Math.clz32(subset & -subset);
      lines[subset] = lines[subset & (subset - 1)] | masks[low];
    }
    return { other, groups, lines };
  });
  for (let k = min_k; k <= max_k; k++) {
    for (const { other, groups, lines } of tables) {
      if (k >= groups.length) continue;
      for (let subset = 1; subset < lines.length; subset++) {
        if (popcount(subset) !== k || popcount(lines[subset]) !== k) continue;
        const members = groups.filter((_, i) => subset & (1 << i));
        const within: Unit[] = [];
        for (let line = 0; line < board.size; line++)
          if (lines[subset] & (1 << line)) within.push(board.units[unit_offset[other](board.size) + line]);
        const inside = new Set(members.flatMap((unit) => unit.cells));
        const cells = within.flatMap((unit) => candidates(unit, state)).filter((cell) => !inside.has(cell));
        if (cells.length) return { rule: Rule.LOCKED, cells: [...new Set(cells)], mark: Cell.EMPTY, units: members, within };
      }
    }
  }
  return null;
}

/** A cell whose rabbit would rule out every place left for some other unit's rabbit can't hold one. */
function blocks(board: Board, state: Int8Array, open: Unit[]): Deduction | null {
  const left = open.map((unit) => ({ unit, id: board.units.indexOf(unit), cells: candidates(unit, state) }));
  const blocked = new Uint8Array(state.length);
  for (let cell = 0; cell < state.length; cell++) {
    if (state[cell] !== Cell.UNKNOWN) continue;
    blocked.fill(0);
    for (const other of blocked_by(board, cell)) blocked[other] = 1;
    const own = board.units_of[cell];
    for (const { unit, id, cells } of left) {
      if (own.includes(id)) continue;
      if (cells.every((other) => blocked[other]))
        return { rule: Rule.BLOCKS, cells: [cell], mark: Cell.EMPTY, units: [unit], within: [] };
    }
  }
  return null;
}

/**
 * The next thing logic proves from a settled state, simplest rule first, so a hint teaches the step a person would
 * spot next: a unit with one place left, a unit confined to one line, a cell that would block a unit, then larger
 * confinements. Null when none of the rules finds anything.
 */
export function next_deduction(board: Board, state: Int8Array): Deduction | null {
  const open = open_units(board, state);
  for (const unit of open) {
    const left = candidates(unit, state);
    if (left.length === 1) return { rule: Rule.ONLY, cells: left, mark: Cell.RABBIT, units: [unit], within: [] };
  }
  const single = locked(board, state, open, 1, 1);
  if (single) return single;
  const blocker = blocks(board, state, open);
  if (blocker) return blocker;
  return locked(board, state, open, 2, board.size - 1);
}

export function apply_deduction(state: Int8Array, deduction: Deduction): void {
  for (const cell of deduction.cells) state[cell] = deduction.mark;
}

/** How far the rules alone get from an empty board. */
export function solve_by_logic(board: Board): Int8Array {
  const state = new Int8Array(board.size * board.size);
  for (;;) {
    settle(board, state);
    const deduction = next_deduction(board, state);
    if (!deduction) return state;
    apply_deduction(state, deduction);
  }
}

export function solves_by_logic(board: Board): boolean {
  return solve_by_logic(board).filter((value) => value === Cell.RABBIT).length === board.size;
}

function place_rabbits(size: number, rng: Rng): number[] {
  const cols: number[] = [];
  const order = Array.from({ length: size }, (_, i) => i);
  const fill = (row: number, used: number): boolean => {
    if (row === size) return true;
    for (const c of shuffle([...order], rng)) {
      if (used & (1 << c) || (row > 0 && Math.abs(cols[row - 1] - c) <= 1)) continue;
      cols[row] = c;
      if (fill(row + 1, used | (1 << c))) return true;
    }
    return false;
  };
  fill(0, 0);
  return cols;
}

function orthogonal(size: number, cell: number): number[] {
  const row = Math.floor(cell / size);
  const col = cell % size;
  const cells: number[] = [];
  if (row > 0) cells.push(cell - size);
  if (row < size - 1) cells.push(cell + size);
  if (col > 0) cells.push(cell - 1);
  if (col < size - 1) cells.push(cell + 1);
  return cells;
}

/**
 * A flood fill from each rabbit: a frontier cell picked at random joins the meadow next to it. Meadows with more edge
 * grow faster, which gives the mix of large and small meadows the deductions need.
 */
function grow_meadows(size: number, solution: readonly number[], rng: Rng): number[] {
  const regions = new Array<number>(size * size).fill(-1);
  const ids = shuffle(
    Array.from({ length: size }, (_, i) => i),
    rng
  );
  const frontier: [number, number][] = [];
  const claim = (cell: number, region: number) => {
    regions[cell] = region;
    for (const next of orthogonal(size, cell)) if (regions[next] === -1) frontier.push([next, region]);
  };
  solution.forEach((col, row) => claim(row * size + col, ids[row]));
  while (frontier.length) {
    const at = Math.floor(rng() * frontier.length);
    const [cell, region] = frontier[at];
    frontier[at] = frontier[frontier.length - 1];
    frontier.pop();
    if (regions[cell] === -1) claim(cell, region);
  }
  return regions;
}

/** A meadow left with only its rabbit takes a cell from a neighbour, so it isn't a given. */
function widen(size: number, regions: number[], answer: Set<number>, rng: Rng): void {
  for (let region = 0; region < size; region++) {
    const cells = regions.flatMap((value, cell) => (value === region ? [cell] : []));
    if (cells.length >= MIN_MEADOW) continue;
    const around = shuffle(
      cells.flatMap((cell) => orthogonal(size, cell)).filter((cell) => regions[cell] !== region && !answer.has(cell)),
      rng
    );
    for (const cell of around) {
      const from = regions[cell];
      if (regions.filter((value) => value === from).length <= MIN_MEADOW) continue;
      regions[cell] = region;
      if (connected(size, regions, from)) break;
      regions[cell] = from;
    }
  }
}

function connected(size: number, regions: readonly number[], region: number): boolean {
  const cells = regions.flatMap((value, cell) => (value === region ? [cell] : []));
  if (!cells.length) return false;
  const seen = new Set([cells[0]]);
  const queue = [cells[0]];
  for (let head = 0; head < queue.length; head++)
    for (const next of orthogonal(size, queue[head]))
      if (regions[next] === region && !seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
  return seen.size === cells.length;
}

/** A one-cell meadow is a given rabbit; the cuts never shrink a meadow that far. */
const MIN_MEADOW = 2;

/**
 * Moves one of `cells` (none of them a rabbit of the answer) into a neighbouring meadow, keeping its old meadow in one
 * piece. The answer stays valid whatever moves.
 */
function reshape(size: number, regions: number[], cells: number[], rng: Rng): boolean {
  for (const cell of shuffle(cells, rng)) {
    const from = regions[cell];
    if (regions.filter((region) => region === from).length <= MIN_MEADOW) continue;
    const targets = shuffle([...new Set(orthogonal(size, cell).map((next) => regions[next]))], rng);
    for (const to of targets) {
      if (to === from) continue;
      regions[cell] = to;
      if (connected(size, regions, from)) return true;
      regions[cell] = from;
    }
  }
  return false;
}

const RESHAPES = 60;

/**
 * Rabbits first, meadows grown around them, then the meadows are reshaped around the rabbits until the solver finds one
 * answer and the deduction rules reach it. A second answer is cut by moving one of its rabbits' cells to another
 * meadow, which leaves that answer two rabbits in one meadow and none in the other. Where the rules get stuck, one of
 * the cells they couldn't decide moves instead. A layout that won't settle is dropped for fresh rabbits.
 */
export function generate(size: number, seed: number): Puzzle {
  const rng = create_rng(seed);
  for (;;) {
    const solution = place_rabbits(size, rng);
    const regions = grow_meadows(size, solution, rng);
    const answer = new Set(solution.map((col, row) => row * size + col));
    widen(size, regions, answer, rng);
    for (let step = 0; step < RESHAPES; step++) {
      const found = solutions(size, regions, 2);
      let cells: number[];
      if (found.length === 1) {
        const state = solve_by_logic(create_board(size, regions));
        if (!state.includes(Cell.UNKNOWN)) return { seed, size, regions, solution };
        cells = [...state.keys()].filter((cell) => state[cell] === Cell.UNKNOWN && !answer.has(cell));
      } else {
        const other = found.find((each) => each.some((col, row) => col !== solution[row]))!;
        cells = other.flatMap((col, row) => (solution[row] === col ? [] : [row * size + col]));
      }
      if (!reshape(size, regions, cells, rng)) break;
    }
  }
}
