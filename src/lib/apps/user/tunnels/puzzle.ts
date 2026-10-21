import { create_rng, pick, shuffle, type Rng } from "$lib/core/utils/random";

export const Size = { SMALL: "small", MEDIUM: "medium", LARGE: "large" } as const;
export type Size = (typeof Size)[keyof typeof Size];

export interface Level {
  rows: number;
  cols: number;
}

/** Five columns keep every letter a finger wide on a phone; the larger boards grow downward. */
export const LEVELS: Readonly<Record<Size, Level>> = {
  small: { rows: 4, cols: 5 },
  medium: { rows: 5, cols: 5 },
  large: { rows: 6, cols: 5 },
};

export const MIN_LENGTH = 5;
export const MAX_LENGTH = 7;
const MIN_WORDS = 3;
const MAX_WORDS = 5;

export interface Trie {
  end: boolean;
  next: Map<string, Trie>;
}
export interface Dictionary {
  answers: Readonly<Record<number, readonly string[]>>;
  trie: Trie;
}

export interface Tunnel {
  word: string;
  cells: readonly number[];
}

export interface Puzzle {
  seed: number;
  size: Size;
  rows: number;
  cols: number;
  letters: readonly string[];
  tunnels: readonly Tunnel[];
}

export function build_trie(words: Iterable<string>): Trie {
  const root: Trie = { end: false, next: new Map() };
  for (const word of words) {
    let node = root;
    for (const letter of word) {
      let child = node.next.get(letter);
      if (!child) node.next.set(letter, (child = { end: false, next: new Map() }));
      node = child;
    }
    node.end = true;
  }
  return root;
}

export function neighbours(rows: number, cols: number, cell: number): number[] {
  const row = Math.floor(cell / cols);
  const col = cell % cols;
  const around: number[] = [];
  if (row > 0) around.push(cell - cols);
  if (col < cols - 1) around.push(cell + 1);
  if (row < rows - 1) around.push(cell + cols);
  if (col > 0) around.push(cell - 1);
  return around;
}

export function adjacent(cols: number, a: number, b: number): boolean {
  const [ra, ca, rb, cb] = [Math.floor(a / cols), a % cols, Math.floor(b / cols), b % cols];
  return Math.abs(ra - rb) + Math.abs(ca - cb) === 1;
}

export function cells_mask(cells: readonly number[]): number {
  let mask = 0;
  for (const cell of cells) mask |= 1 << cell;
  return mask;
}
export function length_sets(total: number): number[][] {
  const sets: number[][] = [];
  const walk = (left: number, min: number, taken: number[]) => {
    if (left === 0) {
      if (taken.length >= MIN_WORDS) sets.push(taken);
      return;
    }
    if (taken.length === MAX_WORDS) return;
    for (let length = min; length <= Math.min(MAX_LENGTH, left); length++) walk(left - length, length, [...taken, length]);
  };
  walk(total, MIN_LENGTH, []);
  return sets;
}

function subset_sums(lengths: readonly number[]): Set<number> {
  let sums = new Set([0]);
  for (const length of lengths) sums = new Set([...sums, ...[...sums].map((sum) => sum + length)]);
  return sums;
}

/** Each free region must be fillable by some of the words still to place, or the carve can't finish. */
function regions_fit(rows: number, cols: number, owner: Int8Array, left: readonly number[]): boolean {
  const sums = subset_sums(left);
  const seen = new Uint8Array(owner.length);
  for (let start = 0; start < owner.length; start++) {
    if (owner[start] !== -1 || seen[start]) continue;
    let size = 0;
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const cell = stack.pop()!;
      size++;
      for (const next of neighbours(rows, cols, cell))
        if (owner[next] === -1 && !seen[next]) {
          seen[next] = 1;
          stack.push(next);
        }
    }
    if (!sums.has(size)) return false;
  }
  return true;
}

/**
 * Splits the board into snake paths of the given lengths. Each path starts at the free cell with the fewest free
 * neighbours (a corner, a pocket), so nothing gets walled off, and wanders at random; a dead end backtracks.
 */
export function carve(rows: number, cols: number, lengths: readonly number[], rng: Rng, budget = 4000): number[][] | null {
  const owner = new Int8Array(rows * cols).fill(-1);
  const paths: number[][] = [];
  let steps = 0;

  const free_degree = (cell: number) => neighbours(rows, cols, cell).filter((next) => owner[next] === -1).length;

  const place = (index: number): boolean => {
    if (index === lengths.length) return true;
    let fewest = Infinity;
    let starts: number[] = [];
    for (let cell = 0; cell < owner.length; cell++) {
      if (owner[cell] !== -1) continue;
      const degree = free_degree(cell);
      if (degree < fewest) [fewest, starts] = [degree, [cell]];
      else if (degree === fewest) starts.push(cell);
    }
    const length = lengths[index];
    const path: number[] = [];

    const grow = (cell: number): boolean => {
      if (++steps > budget) return false;
      owner[cell] = index;
      path.push(cell);
      if (path.length === length) {
        if (regions_fit(rows, cols, owner, lengths.slice(index + 1))) {
          paths.push([...path]);
          if (place(index + 1)) return true;
          paths.pop();
        }
      } else {
        for (const next of shuffle(neighbours(rows, cols, cell), rng)) if (owner[next] === -1 && grow(next)) return true;
      }
      owner[cell] = -1;
      path.pop();
      return false;
    };

    return grow(pick(starts, rng));
  };

  return place(0) ? paths : null;
}

/** Every placement of a dictionary word on the board, one per set of cells: what a cover may be built from. */
export function traceable(rows: number, cols: number, letters: readonly string[], trie: Trie): Map<number, string> {
  const found = new Map<number, string>();
  const walk = (cell: number, node: Trie, mask: number, text: string) => {
    const child = node.next.get(letters[cell]);
    if (!child) return;
    const next_mask = mask | (1 << cell);
    const word = text + letters[cell];
    if (child.end && word.length >= MIN_LENGTH && !found.has(next_mask)) found.set(next_mask, word);
    if (word.length < MAX_LENGTH)
      for (const next of neighbours(rows, cols, cell)) if (!(next_mask & (1 << next))) walk(next, child, next_mask, word);
  };
  for (let cell = 0; cell < rows * cols; cell++) walk(cell, trie, 0, "");
  return found;
}
export function count_covers(rows: number, cols: number, placements: Iterable<number>, limit = 2): number {
  const total = rows * cols;
  const by_cell: number[][] = Array.from({ length: total }, () => []);
  for (const mask of placements) for (let cell = 0; cell < total; cell++) if (mask & (1 << cell)) by_cell[cell].push(mask);
  const full = 2 ** total - 1;
  let count = 0;

  const search = (used: number) => {
    if (used === full) {
      count++;
      return;
    }
    let cell = 0;
    while (used & (1 << cell)) cell++;
    for (const mask of by_cell[cell]) {
      if (mask & used) continue;
      search((used | mask) >>> 0);
      if (count >= limit) return;
    }
  };
  search(0);
  return count;
}

export function letters_of(rows: number, cols: number, tunnels: readonly Tunnel[]): string[] {
  const letters = Array.from({ length: rows * cols }, () => "");
  for (const { word, cells } of tunnels) cells.forEach((cell, i) => (letters[cell] = word[i]));
  return letters;
}
function attempt(level: Level, rng: Rng, dictionary: Dictionary): Tunnel[] | null {
  const { rows, cols } = level;
  const lengths = shuffle([...pick(length_sets(rows * cols), rng)], rng);
  const paths = carve(rows, cols, lengths, rng);
  if (!paths) return null;
  const used = new Set<string>();
  const tunnels: Tunnel[] = [];
  for (const path of paths) {
    const pool = dictionary.answers[path.length];
    let word = pick(pool, rng);
    for (let tries = 0; used.has(word) && tries < 20; tries++) word = pick(pool, rng);
    if (used.has(word)) return null;
    used.add(word);
    tunnels.push({ word, cells: rng() < 0.5 ? path : [...path].reverse() });
  }
  const letters = letters_of(rows, cols, tunnels);
  const placements = traceable(rows, cols, letters, dictionary.trie);
  return count_covers(rows, cols, placements.keys()) === 1 ? tunnels : null;
}

export interface Generated {
  puzzle: Puzzle;
  rerolls: number;
}

export function generate(size: Size, seed: number, dictionary: Dictionary): Generated {
  const level = LEVELS[size];
  const rng = create_rng(seed);
  for (let rerolls = 0; ; rerolls++) {
    const tunnels = attempt(level, rng, dictionary);
    if (!tunnels) continue;
    tunnels.sort((a, b) => b.word.length - a.word.length || Math.min(...a.cells) - Math.min(...b.cells));
    return { puzzle: { seed, size, ...level, letters: letters_of(level.rows, level.cols, tunnels), tunnels }, rerolls };
  }
}
