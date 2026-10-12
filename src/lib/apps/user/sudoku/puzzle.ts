import { create_rng, shuffle, type Rng } from "$lib/core/utils/random";

/** Cells are row-major 0..80; a value is 1..9, 0 is blank. Candidate sets are 9-bit masks, bit `d - 1` for digit d. */
export const ALL = 0x1ff;

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

export const row_of = (cell: number) => Math.floor(cell / 9);
export const col_of = (cell: number) => cell % 9;
export const box_of = (cell: number) => Math.floor(cell / 27) * 3 + Math.floor((cell % 9) / 3);

export const UNITS: readonly (readonly number[])[] = [
  ...Array.from({ length: 9 }, (_, r) => Array.from({ length: 9 }, (_, c) => r * 9 + c)),
  ...Array.from({ length: 9 }, (_, c) => Array.from({ length: 9 }, (_, r) => r * 9 + c)),
  ...Array.from({ length: 9 }, (_, b) =>
    Array.from({ length: 9 }, (_, i) => (Math.floor(b / 3) * 3 + Math.floor(i / 3)) * 9 + (b % 3) * 3 + (i % 3))
  ),
];

export const PEERS: readonly (readonly number[])[] = Array.from({ length: 81 }, (_, cell) => {
  const peers = new Set([...UNITS[row_of(cell)], ...UNITS[9 + col_of(cell)], ...UNITS[18 + box_of(cell)]]);
  peers.delete(cell);
  return [...peers];
});

export const sees = (a: number, b: number) =>
  a !== b && (row_of(a) === row_of(b) || col_of(a) === col_of(b) || box_of(a) === box_of(b));

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
  return values.map((value, cell) => {
    if (value) return 0;
    let used = 0;
    for (const peer of PEERS[cell]) if (values[peer]) used |= bit(values[peer]);
    return ALL & ~used;
  });
}

/**
 * Backtracking over bitmasks, always branching on the cell with the fewest candidates. Stops at `limit` solutions;
 * with `rng` the digits are tried in random order, which is how a full grid is drawn.
 */
function search(grid: number[], limit: number, rng?: Rng): { count: number; first: number[] | null } {
  const rows = new Int32Array(9);
  const cols = new Int32Array(9);
  const boxes = new Int32Array(9);
  for (let cell = 0; cell < 81; cell++) {
    const value = grid[cell];
    if (!value) continue;
    const mask = bit(value);
    const [r, c, b] = [row_of(cell), col_of(cell), box_of(cell)];
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
    for (let cell = 0; cell < 81; cell++) {
      if (grid[cell]) continue;
      const mask = ALL & ~(rows[row_of(cell)] | cols[col_of(cell)] | boxes[box_of(cell)]);
      const n = POPCOUNT[mask];
      if (n < best_count) {
        best = cell;
        best_mask = mask;
        best_count = n;
        if (n <= 1) break;
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
    const [r, c, b] = [row_of(best), col_of(best), box_of(best)];
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

export function full_grid(rng: Rng): number[] {
  return search(new Array(81).fill(0), 1, rng).first!;
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
  values: number[];
  cands: number[];

  constructor(values: readonly number[]) {
    this.values = [...values];
    this.cands = candidates(values);
  }

  place(cell: number, digit: number) {
    this.values[cell] = digit;
    this.cands[cell] = 0;
    for (const peer of PEERS[cell]) this.cands[peer] &= ~bit(digit);
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
    for (let cell = 0; cell < 81; cell++) {
      if (!this.values[cell] && POPCOUNT[this.cands[cell]] === 1) {
        const digit = lowest_digit(this.cands[cell]);
        this.place(cell, digit);
        return { technique: Technique.NAKED_SINGLE, tier: Tier.SINGLES, place: { cell, digit } };
      }
    }
    return null;
  }

  hidden_single(): Step | null {
    // Boxes first: that's where people scan for them.
    for (let u = 0; u < 27; u++) {
      const unit = UNITS[(u + 18) % 27];
      for (let digit = 1; digit <= 9; digit++) {
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
    for (let box = 0; box < 9; box++) {
      const box_cells = UNITS[18 + box];
      for (let digit = 1; digit <= 9; digit++) {
        const spots = box_cells.filter((cell) => this.cands[cell] & bit(digit));
        if (spots.length < 2) continue;
        for (const [line, offset] of [
          [row_of, 0],
          [col_of, 9],
        ] as const) {
          const index = line(spots[0]);
          if (!spots.every((cell) => line(cell) === index)) continue;
          const others = UNITS[offset + index].filter((cell) => box_of(cell) !== box);
          if (this.strip(others, bit(digit))) return { technique: Technique.POINTING, tier: Tier.BASIC };
        }
      }
    }
    for (let unit = 0; unit < 18; unit++) {
      for (let digit = 1; digit <= 9; digit++) {
        const spots = UNITS[unit].filter((cell) => this.cands[cell] & bit(digit));
        if (spots.length < 2) continue;
        const box = box_of(spots[0]);
        if (!spots.every((cell) => box_of(cell) === box)) continue;
        const others = UNITS[18 + box].filter((cell) => !UNITS[unit].includes(cell));
        if (this.strip(others, bit(digit))) return { technique: Technique.BOX_LINE, tier: Tier.BASIC };
      }
    }
    return null;
  }

    naked(size: number, technique: Technique, tier: Tier): Step | null {
    for (const unit of UNITS) {
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
    for (const unit of UNITS) {
      const spots = new Map<number, number[]>();
      for (let digit = 1; digit <= 9; digit++) {
        const cells = unit.filter((cell) => this.cands[cell] & bit(digit));
        if (cells.length >= 2 && cells.length <= size) spots.set(digit, cells);
      }
      for (const group of combinations([...spots.keys()], size)) {
        const cells = new Set(group.flatMap((digit) => spots.get(digit)!));
        if (cells.size !== size) continue;
        const keep = group.reduce((acc, digit) => acc | bit(digit), 0);
        if (this.strip(cells, ALL & ~keep)) return { technique, tier };
      }
    }
    return null;
  }

    fish(size: number, technique: Technique): Step | null {
    for (let digit = 1; digit <= 9; digit++) {
      for (const [base, cover] of [
        [0, 9],
        [9, 0],
      ]) {
        const lines: { index: number; spots: number }[] = [];
        for (let i = 0; i < 9; i++) {
          let spots = 0;
          UNITS[base + i].forEach((cell, j) => {
            if (this.cands[cell] & bit(digit)) spots |= 1 << j;
          });
          const n = POPCOUNT[spots];
          if (n >= 2 && n <= size) lines.push({ index: i, spots });
        }
        for (const group of combinations(lines, size)) {
          const union = group.reduce((acc, line) => acc | line.spots, 0);
          if (POPCOUNT[union] !== size) continue;
          const own = new Set(group.map((line) => line.index));
          const victims: number[] = [];
          for (let j = 0; j < 9; j++) {
            if (!(union & (1 << j))) continue;
            UNITS[cover + j].forEach((cell, i) => {
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
    for (let pivot = 0; pivot < 81; pivot++) {
      const pm = this.cands[pivot];
      if (POPCOUNT[pm] !== (xyz ? 3 : 2)) continue;
      const pincers = PEERS[pivot].filter((cell) => {
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
        const victims = PEERS[a].filter((cell) => cell !== pivot && sees(cell, b) && (!xyz || sees(cell, pivot)));
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
  /** Stop removing at this many givens, so easy ones stay gentle. */
  floor: number;
}

const RECIPES: Record<Difficulty, Recipe> = {
  easy: { tier: Tier.SINGLES, floor: 36 },
  medium: { tier: Tier.BASIC, floor: 0 },
  hard: { tier: Tier.ADVANCED, floor: 0 },
  expert: { tier: Tier.BEYOND, floor: 0 },
};

/** Attempts per puzzle. A count, not a clock, so the same seed always draws the same puzzle. */
export const ATTEMPTS = 60;

function carve(solution: readonly number[], recipe: Recipe, rng: Rng): number[] {
  const givens = [...solution];
  const order = shuffle(
    Array.from({ length: 41 }, (_, i) => i),
    rng
  );
  let left = 81;
  for (const cell of order) {
    const pair = cell === 40 ? [40] : [cell, 80 - cell];
    if (left - pair.length < recipe.floor) continue;
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
export function generate(difficulty: Difficulty, seed: number): Puzzle {
  const recipe = RECIPES[difficulty];
  const rng = create_rng(seed);
  let best: Puzzle | null = null;
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const solution = full_grid(rng);
    const givens = carve(solution, recipe, rng);
    const tier = grade(givens);
    const puzzle: Puzzle = { seed, givens, solution, tier };
    if (tier === recipe.tier) return puzzle;
    if (!best || Math.abs(tier - recipe.tier) < Math.abs(best.tier - recipe.tier)) best = puzzle;
  }
  return best!;
}
