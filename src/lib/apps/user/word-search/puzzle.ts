import { create_rng, pick, shuffle, type Rng } from "$lib/core/utils/random";
import { BLOCKED, LETTER_WEIGHTS, THEMES } from "./words";

export const Difficulty = { EASY: "easy", MEDIUM: "medium", HARD: "hard" } as const;
export type Difficulty = (typeof Difficulty)[keyof typeof Difficulty];

export interface Direction {
  dr: number;
  dc: number;
}

/** Forward directions first, so each level's set is a prefix: across and down, then rising and falling diagonals. */
export const DIRECTIONS: readonly Direction[] = [
  { dr: 0, dc: 1 },
  { dr: 1, dc: 0 },
  { dr: 1, dc: 1 },
  { dr: -1, dc: 1 },
  { dr: 0, dc: -1 },
  { dr: -1, dc: 0 },
  { dr: -1, dc: -1 },
  { dr: 1, dc: -1 },
];

export interface Level {
  size: number;
  words: number;
  directions: readonly Direction[];
}

export const LEVELS: Readonly<Record<Difficulty, Level>> = {
  easy: { size: 10, words: 8, directions: DIRECTIONS.slice(0, 2) },
  medium: { size: 13, words: 12, directions: DIRECTIONS.slice(0, 4) },
  hard: { size: 16, words: 16, directions: DIRECTIONS },
};

export interface Placement extends Direction {
  word: string;
  row: number;
  col: number;
}

export interface Puzzle {
  seed: number;
  difficulty: Difficulty;
  size: number;
  theme: string;
  letters: readonly string[];
  /** Alphabetical, the order the list shows them in. */
  placements: readonly Placement[];
}

export function reverse(word: string): string {
  return [...word].reverse().join("");
}

export function line_cells(
  size: number,
  row: number,
  col: number,
  dr: number,
  dc: number,
  length: number
): number[] | null {
  const end_row = row + dr * (length - 1);
  const end_col = col + dc * (length - 1);
  if (row < 0 || col < 0 || row >= size || col >= size) return null;
  if (end_row < 0 || end_col < 0 || end_row >= size || end_col >= size) return null;
  return Array.from({ length }, (_, i) => (row + dr * i) * size + col + dc * i);
}

export function placement_cells(size: number, placement: Placement): number[] {
  return line_cells(size, placement.row, placement.col, placement.dr, placement.dc, placement.word.length)!;
}

export function occurrences(letters: readonly string[], size: number, word: string): Placement[] {
  const found: Placement[] = [];
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (letters[row * size + col] !== word[0]) continue;
      for (const { dr, dc } of DIRECTIONS) {
        const end_row = row + dr * (word.length - 1);
        const end_col = col + dc * (word.length - 1);
        if (end_row < 0 || end_col < 0 || end_row >= size || end_col >= size) continue;
        let i = 1;
        while (i < word.length && letters[(row + dr * i) * size + col + dc * i] === word[i]) i++;
        if (i === word.length) found.push({ word, row, col, dr, dc });
      }
    }
  }
  return found;
}

/** Two listed words where one hides inside the other (or its reverse) would read twice in the grid. */
function clashes(a: string, b: string): boolean {
  return a.includes(b) || b.includes(a) || a.includes(reverse(b)) || b.includes(reverse(a));
}

function weighted_letter(rng: Rng): string {
  let roll = rng() * LETTER_TOTAL;
  for (const [letter, weight] of LETTER_ENTRIES) {
    roll -= weight;
    if (roll < 0) return letter;
  }
  return "E";
}

const LETTER_ENTRIES = Object.entries(LETTER_WEIGHTS);
const LETTER_TOTAL = LETTER_ENTRIES.reduce((sum, [, weight]) => sum + weight, 0);

/**
 * Lays one word: every spot it fits, half the time preferring one that crosses an earlier word, so long lists
 * interlock the way printed puzzles do instead of sitting in separate corners.
 */
function lay(grid: string[], size: number, word: string, directions: readonly Direction[], rng: Rng): Placement | null {
  const spots: Placement[] = [];
  const crossing: Placement[] = [];
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      for (const { dr, dc } of directions) {
        const cells = line_cells(size, row, col, dr, dc, word.length);
        if (!cells) continue;
        let shared = 0;
        let fits = true;
        for (let i = 0; i < cells.length && fits; i++) {
          const letter = grid[cells[i]];
          if (letter === word[i]) shared++;
          else if (letter !== "") fits = false;
        }
        if (!fits || shared === word.length) continue;
        spots.push({ word, row, col, dr, dc });
        if (shared) crossing.push({ word, row, col, dr, dc });
      }
    }
  }
  if (!spots.length) return null;
  return crossing.length && rng() < 0.5 ? pick(crossing, rng) : pick(spots, rng);
}

/**
 * Re-rolls filler until every listed word reads exactly once and no blocked word reads through a filler cell.
 * Fails when a duplicate is made only of placed letters, since no filler change can break it.
 */
function repair(
  grid: string[],
  size: number,
  placements: readonly Placement[],
  filler: ReadonlySet<number>,
  rng: Rng
): boolean {
  for (let round = 0; round < 60; round++) {
    const bad: number[][] = [];
    for (const placement of placements) {
      for (const hit of occurrences(grid, size, placement.word)) {
        const same =
          hit.row === placement.row && hit.col === placement.col && hit.dr === placement.dr && hit.dc === placement.dc;
        if (!same) bad.push(placement_cells(size, hit));
      }
    }
    for (const word of BLOCKED) {
      for (const hit of occurrences(grid, size, word)) {
        const cells = placement_cells(size, hit);
        if (cells.some((cell) => filler.has(cell))) bad.push(cells);
      }
    }
    if (!bad.length) return true;
    for (const cells of bad) {
      const free = cells.filter((cell) => filler.has(cell));
      if (!free.length) return false;
      grid[pick(free, rng)] = weighted_letter(rng);
    }
  }
  return false;
}

function attempt(difficulty: Difficulty, rng: Rng, words: readonly string[]): Omit<Puzzle, "seed" | "theme"> | null {
  const { size, directions, words: count } = LEVELS[difficulty];
  const pool = shuffle(
    words.filter((word) => word.length >= 3 && word.length <= size && word !== reverse(word)),
    rng
  );
  const chosen: string[] = [];
  for (const word of pool) {
    if (chosen.length === count + 4) break;
    if (!chosen.some((other) => clashes(word, other))) chosen.push(word);
  }

  const grid: string[] = new Array(size * size).fill("");
  const placements: Placement[] = [];
  for (const word of chosen.sort((a, b) => b.length - a.length)) {
    if (placements.length === count) break;
    const placement = lay(grid, size, word, directions, rng);
    if (!placement) continue;
    placement_cells(size, placement).forEach((cell, i) => (grid[cell] = word[i]));
    placements.push(placement);
  }
  if (placements.length < count) return null;

  const filler = new Set<number>();
  grid.forEach((letter, cell) => {
    if (letter) return;
    filler.add(cell);
    grid[cell] = weighted_letter(rng);
  });
  if (!repair(grid, size, placements, filler, rng)) return null;
  return {
    difficulty,
    size,
    letters: grid,
    placements: placements.sort((a, b) => a.word.localeCompare(b.word)),
  };
}

export function generate(difficulty: Difficulty, seed: number): Puzzle {
  const rng = create_rng(seed);
  const theme = pick(THEMES, rng);
  for (let tries = 0; tries < 100; tries++) {
    const puzzle = attempt(difficulty, rng, theme.words);
    if (puzzle) return { ...puzzle, seed, theme: theme.name };
  }
  throw new Error(`[word-search] no puzzle for ${difficulty} seed ${seed}`);
}
