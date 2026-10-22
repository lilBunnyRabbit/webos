import { create_rng, shuffle, type Rng } from "$lib/core/utils/random";
import { Size, SIZES } from "./size";

export { Size, SIZES };

/**
 * Cells are row-major `0..cells - 1`; a value is `1..size`, 0 is blank. Candidate sets are masks, bit `d - 1` for
 * digit d. A size is its config (side, box rows, box columns); everything else is precomputed from it once.
 */
export interface SizeConfig {
  size: number;
  box_rows: number;
  box_cols: number;
}

export interface Shape extends SizeConfig {
  cells: number;
  all: number;
  row: readonly number[];
  col: readonly number[];
  box: readonly number[];
  /** Rows `0..size - 1`, then columns, then boxes. */
  units: readonly (readonly number[])[];
  peers: readonly (readonly number[])[];
}

function make_shape({ size, box_rows, box_cols }: SizeConfig): Shape {
  const cells = size * size;
  const per_band = size / box_cols;
  const box_index = (cell: number) =>
    Math.floor(Math.floor(cell / size) / box_rows) * per_band + Math.floor((cell % size) / box_cols);
  const row = Array.from({ length: cells }, (_, cell) => Math.floor(cell / size));
  const col = Array.from({ length: cells }, (_, cell) => cell % size);
  const box = Array.from({ length: cells }, (_, cell) => box_index(cell));
  const units = [
    ...Array.from({ length: size }, (_, r) => Array.from({ length: size }, (_, c) => r * size + c)),
    ...Array.from({ length: size }, (_, c) => Array.from({ length: size }, (_, r) => r * size + c)),
    ...Array.from({ length: size }, (_, b) =>
      Array.from(
        { length: size },
        (_, i) =>
          (Math.floor(b / per_band) * box_rows + Math.floor(i / box_cols)) * size + (b % per_band) * box_cols + (i % box_cols)
      )
    ),
  ];
  const peers = Array.from({ length: cells }, (_, cell) => {
    const set = new Set([...units[row[cell]], ...units[size + col[cell]], ...units[2 * size + box[cell]]]);
    set.delete(cell);
    return [...set];
  });
  return { size, box_rows, box_cols, cells, all: (1 << size) - 1, row, col, box, units, peers };
}

export const SHAPES: Record<Size, Shape> = {
  [Size.NINE]: make_shape({ size: 9, box_rows: 3, box_cols: 3 }),
  [Size.SIX]: make_shape({ size: 6, box_rows: 2, box_cols: 3 }),
};

export function shape_of(values: readonly number[]): Shape {
  return values.length === SHAPES[Size.SIX].cells ? SHAPES[Size.SIX] : SHAPES[Size.NINE];
}

/** The classic grid's tables, which the 9×9 tests read directly. */
export const ALL = SHAPES[Size.NINE].all;
export const PEERS = SHAPES[Size.NINE].peers;

export const Tier = { SINGLES: 1, BASIC: 2, ADVANCED: 3, BEYOND: 4 } as const;
export type Tier = (typeof Tier)[keyof typeof Tier];

export const Technique = {
  NAKED_SINGLE: "Naked single",
  HIDDEN_SINGLE: "Hidden single",
  POINTING: "Pointing pair",
  BOX_LINE: "Box/line reduction",
  NAKED_PAIR: "Naked pair",
  HIDDEN_PAIR: "Hidden pair",
  NAKED_TRIPLE: "Naked triple",
  HIDDEN_TRIPLE: "Hidden triple",
  X_WING: "X-Wing",
  Y_WING: "Y-Wing",
  SWORDFISH: "Swordfish",
  XYZ_WING: "XYZ-Wing",
} as const;
export type Technique = (typeof Technique)[keyof typeof Technique];

export interface Puzzle {
  seed: number;
  givens: readonly number[];
  solution: readonly number[];
  tier: Tier;
}

const sees = (shape: Shape, a: number, b: number) =>
  a !== b && (shape.row[a] === shape.row[b] || shape.col[a] === shape.col[b] || shape.box[a] === shape.box[b]);

const POPCOUNT = Uint8Array.from({ length: 512 }, (_, mask) => {
  let count = 0;
  for (let m = mask; m; m &= m - 1) count++;
  return count;
});

export const bit = (digit: number) => 1 << (digit - 1);
export const count_bits = (mask: number) => POPCOUNT[mask];
export function digits_of(mask: number): number[] {
  const digits: number[] = [];
  for (let d = 1; d <= 9; d++) if (mask & bit(d)) digits.push(d);
  return digits;
}
const lowest_digit = (mask: number) => 32 - Math.clz32(mask & -mask);

export function candidates(values: readonly number[]): number[] {
  const { peers, all } = shape_of(values);
  return values.map((value, cell) => {
    if (value) return 0;
    let used = 0;
    for (const peer of peers[cell]) if (values[peer]) used |= bit(values[peer]);
    return all & ~used;
  });
}

/**
 * Backtracking over bitmasks, always branching on the cell with the fewest candidates. Stops at `limit` solutions;
 * with `rng` the digits are tried in random order, which is how a full grid is drawn.
 */
function search(grid: number[], limit: number, rng?: Rng): { count: number; first: number[] | null } {
  const { size, cells, all, row, col, box } = shape_of(grid);
  const rows = new Int32Array(size);
  const cols = new Int32Array(size);
  const boxes = new Int32Array(size);
  for (let cell = 0; cell < cells; cell++) {
    const value = grid[cell];
    if (!value) continue;
    const mask = bit(value);
    const [r, c, b] = [row[cell], col[cell], box[cell]];
    if ((rows[r] | cols[c] | boxes[b]) & mask) return { count: 0, first: null };
    rows[r] |= mask;
    cols[c] |= mask;
    boxes[b] |= mask;
  }
  let count = 0;
  let first: number[] | null = null;

  const step = (): boolean => {
    let best = -1;
    let best_mask = 0;
    let best_count = 10;
    scan: for (let r = 0, cell = 0; r < size; r++) {
      for (let c = 0; c < size; c++, cell++) {
        if (grid[cell]) continue;
        const mask = all & ~(rows[r] | cols[c] | boxes[box[cell]]);
        const n = POPCOUNT[mask];
        if (n < best_count) {
          best = cell;
          best_mask = mask;
          best_count = n;
          if (n <= 1) break scan;
        }
      }
    }
    if (best < 0) {
      count++;
      first ??= [...grid];
      return count >= limit;
    }
    if (!best_mask) return false;
    const digits = digits_of(best_mask);
    if (rng) shuffle(digits, rng);
    const [r, c, b] = [row[best], col[best], box[best]];
    for (const digit of digits) {
      const mask = bit(digit);
      grid[best] = digit;
      rows[r] |= mask;
      cols[c] |= mask;
      boxes[b] |= mask;
      const done = step();
      rows[r] &= ~mask;
      cols[c] &= ~mask;
      boxes[b] &= ~mask;
      grid[best] = 0;
      if (done) return true;
    }
    return false;
  };
  step();
  return { count, first };
}

export function count_solutions(values: readonly number[], limit = 2): number {
  return search([...values], limit).count;
}

export function solve(values: readonly number[]): number[] | null {
  return search([...values], 1).first;
}

export function full_grid(rng: Rng, size: Size = Size.NINE): number[] {
  return search(new Array(SHAPES[size].cells).fill(0), 1, rng).first!;
}

export interface Step {
  technique: Technique;
  tier: Tier;
  place?: { cell: number; digit: number };
}

function* combinations<T>(items: readonly T[], size: number, start = 0, picked: T[] = []): Generator<T[]> {
  if (picked.length === size) {
    yield picked;
    return;
  }
  for (let i = start; i <= items.length - (size - picked.length); i++) {
    yield* combinations(items, size, i + 1, [...picked, items[i]]);
  }
}

class Logic {
  readonly shape: Shape;
  values: number[];
  cands: number[];

  constructor(values: readonly number[]) {
    this.shape = shape_of(values);
    this.values = [...values];
    this.cands = candidates(values);
  }

  place(cell: number, digit: number) {
    this.values[cell] = digit;
    this.cands[cell] = 0;
    for (const peer of this.shape.peers[cell]) this.cands[peer] &= ~bit(digit);
  }

  strip(cells: Iterable<number>, mask: number): boolean {
    let changed = false;
    for (const cell of cells) {
      if (this.cands[cell] & mask) {
        this.cands[cell] &= ~mask;
        changed = true;
      }
    }
    return changed;
  }

  solved(): boolean {
    return this.values.every(Boolean);
  }

  broken(): boolean {
    return this.values.some((value, cell) => !value && !this.cands[cell]);
  }

  naked_single(): Step | null {
    for (let cell = 0; cell < this.shape.cells; cell++) {
      if (!this.values[cell] && POPCOUNT[this.cands[cell]] === 1) {
        const digit = lowest_digit(this.cands[cell]);
        this.place(cell, digit);
        return { technique: Technique.NAKED_SINGLE, tier: Tier.SINGLES, place: { cell, digit } };
      }
    }
    return null;
  }

  hidden_single(): Step | null {
    const { size, units } = this.shape;
    // Boxes first: that's where people scan for them.
    for (let u = 0; u < 3 * size; u++) {
      const unit = units[(u + 2 * size) % (3 * size)];
      for (let digit = 1; digit <= size; digit++) {
        let spot = -1;
        let n = 0;
        for (const cell of unit) {
          if (this.cands[cell] & bit(digit)) {
            spot = cell;
            n++;
          }
        }
        if (n === 1) {
          this.place(spot, digit);
          return { technique: Technique.HIDDEN_SINGLE, tier: Tier.SINGLES, place: { cell: spot, digit } };
        }
      }
    }
    return null;
  }

  intersections(): Step | null {
    const { size, units, row, col, box } = this.shape;
    for (let b = 0; b < size; b++) {
      const box_cells = units[2 * size + b];
      for (let digit = 1; digit <= size; digit++) {
        const spots = box_cells.filter((cell) => this.cands[cell] & bit(digit));
        if (spots.length < 2) continue;
        for (const [line, offset] of [
          [row, 0],
          [col, size],
        ] as const) {
          const index = line[spots[0]];
          if (!spots.every((cell) => line[cell] === index)) continue;
          const others = units[offset + index].filter((cell) => box[cell] !== b);
          if (this.strip(others, bit(digit))) return { technique: Technique.POINTING, tier: Tier.BASIC };
        }
      }
    }
    for (let unit = 0; unit < 2 * size; unit++) {
      for (let digit = 1; digit <= size; digit++) {
        const spots = units[unit].filter((cell) => this.cands[cell] & bit(digit));
        if (spots.length < 2) continue;
        const b = box[spots[0]];
        if (!spots.every((cell) => box[cell] === b)) continue;
        const others = units[2 * size + b].filter((cell) => !units[unit].includes(cell));
        if (this.strip(others, bit(digit))) return { technique: Technique.BOX_LINE, tier: Tier.BASIC };
      }
    }
    return null;
  }

  naked(size: number, technique: Technique, tier: Tier): Step | null {
    for (const unit of this.shape.units) {
      const open = unit.filter((cell) => {
        const n = POPCOUNT[this.cands[cell]];
        return n >= 2 && n <= size;
      });
      for (const group of combinations(open, size)) {
        const mask = group.reduce((acc, cell) => acc | this.cands[cell], 0);
        if (POPCOUNT[mask] !== size) continue;
        const rest = unit.filter((cell) => !group.includes(cell));
        if (this.strip(rest, mask)) return { technique, tier };
      }
    }
    return null;
  }

  hidden(size: number, technique: Technique, tier: Tier): Step | null {
    for (const unit of this.shape.units) {
      const spots = new Map<number, number[]>();
      for (let digit = 1; digit <= this.shape.size; digit++) {
        const cells = unit.filter((cell) => this.cands[cell] & bit(digit));
        if (cells.length >= 2 && cells.length <= size) spots.set(digit, cells);
      }
      for (const group of combinations([...spots.keys()], size)) {
        const cells = new Set(group.flatMap((digit) => spots.get(digit)!));
        if (cells.size !== size) continue;
        const keep = group.reduce((acc, digit) => acc | bit(digit), 0);
        if (this.strip(cells, this.shape.all & ~keep)) return { technique, tier };
      }
    }
    return null;
  }

  fish(size: number, technique: Technique): Step | null {
    const { size: n, units } = this.shape;
    for (let digit = 1; digit <= n; digit++) {
      for (const [base, cover] of [
        [0, n],
        [n, 0],
      ]) {
        const lines: { index: number; spots: number }[] = [];
        for (let i = 0; i < n; i++) {
          let spots = 0;
          units[base + i].forEach((cell, j) => {
            if (this.cands[cell] & bit(digit)) spots |= 1 << j;
          });
          const count = POPCOUNT[spots];
          if (count >= 2 && count <= size) lines.push({ index: i, spots });
        }
        for (const group of combinations(lines, size)) {
          const union = group.reduce((acc, line) => acc | line.spots, 0);
          if (POPCOUNT[union] !== size) continue;
          const own = new Set(group.map((line) => line.index));
          const victims: number[] = [];
          for (let j = 0; j < n; j++) {
            if (!(union & (1 << j))) continue;
            units[cover + j].forEach((cell, i) => {
              if (!own.has(i)) victims.push(cell);
            });
          }
          if (this.strip(victims, bit(digit))) return { technique, tier: Tier.ADVANCED };
        }
      }
    }
    return null;
  }

  /**
   * Y-Wing: a pivot {a,b} sees pincers {a,c} and {b,c}; either way c lands on a pincer, so cells seeing both lose c.
   * XYZ-Wing: the pivot is {a,b,c} and could be c itself, so the victims must see it too.
   */
  wings(xyz: boolean): Step | null {
    const { shape } = this;
    for (let pivot = 0; pivot < shape.cells; pivot++) {
      const pm = this.cands[pivot];
      if (POPCOUNT[pm] !== (xyz ? 3 : 2)) continue;
      const pincers = shape.peers[pivot].filter((cell) => {
        const m = this.cands[cell];
        return POPCOUNT[m] === 2 && (xyz ? (m & pm) === m : POPCOUNT[m & pm] === 1);
      });
      for (const [a, b] of combinations(pincers, 2)) {
        const ma = this.cands[a];
        const mb = this.cands[b];
        if (ma === mb) continue;
        const z = ma & mb;
        if (POPCOUNT[z] !== 1) continue;
        if (xyz ? (ma | mb) !== pm : (z & pm) !== 0 || (ma | mb) !== (pm | z)) continue;
        const victims = shape.peers[a].filter(
          (cell) => cell !== pivot && sees(shape, cell, b) && (!xyz || sees(shape, cell, pivot))
        );
        if (this.strip(victims, z)) return { technique: xyz ? Technique.XYZ_WING : Technique.Y_WING, tier: Tier.ADVANCED };
      }
    }
    return null;
  }

  step(max: Tier): Step | null {
    const steps: [Tier, () => Step | null][] = [
      [Tier.SINGLES, () => this.hidden_single()],
      [Tier.SINGLES, () => this.naked_single()],
      [Tier.BASIC, () => this.intersections()],
      [Tier.BASIC, () => this.naked(2, Technique.NAKED_PAIR, Tier.BASIC)],
      [Tier.ADVANCED, () => this.hidden(2, Technique.HIDDEN_PAIR, Tier.ADVANCED)],
      [Tier.ADVANCED, () => this.naked(3, Technique.NAKED_TRIPLE, Tier.ADVANCED)],
      [Tier.ADVANCED, () => this.hidden(3, Technique.HIDDEN_TRIPLE, Tier.ADVANCED)],
      [Tier.ADVANCED, () => this.fish(2, Technique.X_WING)],
      [Tier.ADVANCED, () => this.wings(false)],
      [Tier.ADVANCED, () => this.fish(3, Technique.SWORDFISH)],
      [Tier.ADVANCED, () => this.wings(true)],
    ];
    for (const [tier, run] of steps) {
      if (tier > max) break;
      const found = run();
      if (found) return found;
    }
    return null;
  }
}

/**
 * Solves like a person, cheapest technique first, and returns the hardest tier it needed. `Tier.BEYOND` means the
 * techniques up to `max` ran out before the grid was full.
 */
export function grade(values: readonly number[], max: Tier = Tier.ADVANCED): Tier {
  const logic = new Logic(values);
  let hardest: Tier = Tier.SINGLES;
  while (!logic.solved()) {
    if (logic.broken()) return Tier.BEYOND;
    const step = logic.step(max);
    if (!step) return Tier.BEYOND;
    if (step.tier > hardest) hardest = step.tier;
  }
  return hardest;
}

export interface Deduction {
  cell: number;
  digit: number;
  technique: Technique;
}

export function next_deduction(values: readonly number[]): Deduction | null {
  const logic = new Logic(values);
  let hardest: Step | null = null;
  while (!logic.solved() && !logic.broken()) {
    const step = logic.step(Tier.ADVANCED);
    if (!step) return null;
    if (!hardest || step.tier > hardest.tier) hardest = step;
    if (step.place) return { ...step.place, technique: hardest.technique };
  }
  return null;
}

export const Difficulty = { EASY: "easy", MEDIUM: "medium", HARD: "hard", EXPERT: "expert" } as const;
export type Difficulty = (typeof Difficulty)[keyof typeof Difficulty];
export const DIFFICULTIES: readonly Difficulty[] = Object.values(Difficulty);

interface Recipe {
  tier: Tier;
  /** Stop removing at this share of the cells, so easy ones stay gentle: 36 givens on 9×9, 16 on 6×6. */
  floor: number;
}

const RECIPES: Record<Difficulty, Recipe> = {
  easy: { tier: Tier.SINGLES, floor: 4 / 9 },
  medium: { tier: Tier.BASIC, floor: 0 },
  hard: { tier: Tier.ADVANCED, floor: 0 },
  expert: { tier: Tier.BEYOND, floor: 0 },
};

/** Attempts per puzzle. A count, not a clock, so the same seed always draws the same puzzle. */
export const ATTEMPTS = 60;

function carve(solution: readonly number[], recipe: Recipe, rng: Rng): number[] {
  const cells = solution.length;
  const floor = Math.round(cells * recipe.floor);
  const givens = [...solution];
  const order = shuffle(
    Array.from({ length: Math.ceil(cells / 2) }, (_, i) => i),
    rng
  );
  let left = cells;
  for (const cell of order) {
    const mirror = cells - 1 - cell;
    const pair = cell === mirror ? [cell] : [cell, mirror];
    if (left - pair.length < floor) continue;
    for (const c of pair) givens[c] = 0;
    // Logic finishing proves the puzzle unique; past the techniques only the brute-force count can.
    const keeps =
      recipe.tier === Tier.BEYOND ? count_solutions(givens) === 1 : grade(givens, recipe.tier) <= recipe.tier;
    if (keeps) left -= pair.length;
    else for (const c of pair) givens[c] = solution[c];
  }
  return givens;
}

/**
 * A random full grid, then givens removed in point-symmetric pairs while the puzzle stays unique and inside the
 * difficulty's techniques. Retried until the hardest technique needed is exactly the difficulty's; when the attempts
 * run out the closest one wins.
 */
export function generate(difficulty: Difficulty, seed: number, size: Size = Size.NINE): Puzzle {
  const recipe = RECIPES[difficulty];
  const rng = create_rng(seed);
  let best: Puzzle | null = null;
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const solution = full_grid(rng, size);
    const givens = carve(solution, recipe, rng);
    const tier = grade(givens);
    const puzzle: Puzzle = { seed, givens, solution, tier };
    if (tier === recipe.tier) return puzzle;
    if (!best || Math.abs(tier - recipe.tier) < Math.abs(best.tier - recipe.tier)) best = puzzle;
  }
  return best!;
}
