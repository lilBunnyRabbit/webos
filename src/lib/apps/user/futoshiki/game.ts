import { daily_seed } from "$kit/games/time";
import { z } from "zod";
import {
  across_cells,
  down_cells,
  generate,
  next_deduction,
  Relation,
  units_of,
  type Puzzle,
} from "./puzzle";

export const Size = { S4: "4", S5: "5", S6: "6", S7: "7" } as const;
export type Size = (typeof Size)[keyof typeof Size];
export const SIZES: readonly Size[] = Object.values(Size);
export const size_schema = z.enum(Size);

export interface Game {
  puzzle: Puzzle;
  values: readonly number[];
  /** Bit d for digit d. A cell holding a digit keeps its notes hidden, not lost. */
  notes: readonly number[];
  hints: number;
  solved: boolean;
}

export function new_game(size: Size, seed: number): Game {
  const puzzle = generate(Number(size), seed);
  return { puzzle, values: [...puzzle.givens], notes: new Array(puzzle.givens.length).fill(0), hints: 0, solved: false };
}

export const SignState = { OPEN: "open", MET: "met", BROKEN: "broken" } as const;
export type SignState = (typeof SignState)[keyof typeof SignState];

function sign_state(relation: Relation, a: number, b: number): SignState {
  if (relation === Relation.NONE || !a || !b) return SignState.OPEN;
  return (relation === Relation.LESS ? a < b : a > b) ? SignState.MET : SignState.BROKEN;
}

export function sign_states(game: Game): { across: SignState[]; down: SignState[] } {
  const { size, across, down } = game.puzzle;
  const state = (relation: Relation, [a, b]: [number, number]) => sign_state(relation, game.values[a], game.values[b]);
  return {
    across: across.map((relation, index) => state(relation, across_cells(size, index))),
    down: down.map((relation, index) => state(relation, down_cells(size, index))),
  };
}

/** Cells that break a rule you can see: a digit twice in a row or column, or either side of a broken sign. */
export function conflicts(game: Game): Set<number> {
  const { size } = game.puzzle;
  const found = new Set<number>();
  for (const unit of units_of(size)) {
    for (const a of unit) {
      if (game.values[a] && unit.some((b) => b !== a && game.values[b] === game.values[a])) found.add(a);
    }
  }
  const signs = sign_states(game);
  const mark = (states: SignState[], cells: (index: number) => [number, number]) =>
    states.forEach((state, index) => state === SignState.BROKEN && cells(index).forEach((cell) => found.add(cell)));
  mark(signs.across, (index) => across_cells(size, index));
  mark(signs.down, (index) => down_cells(size, index));
  return found;
}

/** A full grid with no broken rule is the solution: generated puzzles have only one. */
export function is_solved(game: Game): boolean {
  return game.values.every(Boolean) && conflicts(game).size === 0;
}

export function with_cells(game: Game, values: readonly number[], notes: readonly number[]): Game {
  const next = { ...game, values, notes };
  return { ...next, solved: is_solved(next) };
}

export function peers_of(size: number, index: number): number[] {
  const row = Math.floor(index / size);
  const col = index % size;
  const peers: number[] = [];
  for (let i = 0; i < size; i++) {
    if (i !== col) peers.push(row * size + i);
    if (i !== row) peers.push(i * size + col);
  }
  return peers;
}

/** Like most apps of the genre, a placed digit also leaves the notes along its row and column. */
export function place(game: Game, index: number, digit: number): Game {
  if (game.puzzle.givens[index] || game.values[index] === digit) return game;
  const values = [...game.values];
  values[index] = digit;
  if (!digit) return with_cells(game, values, game.notes);
  const notes = [...game.notes];
  for (const peer of peers_of(game.puzzle.size, index)) notes[peer] &= ~(1 << digit);
  return with_cells(game, values, notes);
}

export function toggle_note(game: Game, index: number, digit: number): Game {
  if (game.values[index]) return game;
  const notes = [...game.notes];
  notes[index] ^= 1 << digit;
  return with_cells(game, game.values, notes);
}

export function clear_notes(game: Game, index: number): Game {
  if (!game.notes[index]) return game;
  const notes = [...game.notes];
  notes[index] = 0;
  return with_cells(game, game.values, notes);
}

/**
 * Pencils in every candidate that the digits on the board and the signs next to each cell still allow. Only the
 * direct consequences, not the whole deduction, or the notes would hand over the answer.
 */
export function fill_notes(game: Game): Game {
  const { size, across, down } = game.puzzle;
  const full = ((1 << (size + 1)) - 1) & ~1;
  const notes = game.values.map((value, index) => {
    if (value) return game.notes[index];
    let mask = full;
    for (const peer of peers_of(size, index)) if (game.values[peer]) mask &= ~(1 << game.values[peer]);
    const above = (digit: number) => ~((1 << (digit + 1)) - 1);
    const below = (digit: number) => (1 << digit) - 1;
    const limit = (relation: Relation, other: number, self_first: boolean) => {
      if (relation === Relation.NONE) return;
      const self_less = (relation === Relation.LESS) === self_first;
      if (other) mask &= self_less ? below(other) : above(other);
      else mask &= self_less ? below(size) : above(1);
    };
    const row = Math.floor(index / size);
    const col = index % size;
    if (col < size - 1) limit(across[row * (size - 1) + col], game.values[index + 1], true);
    if (col > 0) limit(across[row * (size - 1) + col - 1], game.values[index - 1], false);
    if (row < size - 1) limit(down[index], game.values[index + size], true);
    if (row > 0) limit(down[index - size], game.values[index - size], false);
    return mask;
  });
  return with_cells(game, game.values, notes);
}

export function mistakes(game: Game): number[] {
  return game.values.flatMap((value, index) => (value && value !== game.puzzle.solution[index] ? [index] : []));
}

export interface Hint {
  index: number;
  digit: number;
  fix: boolean;
}

/**
 * First a wrong digit, since everything after it builds on sand. Otherwise the cell deduction reaches soonest from
 * what's on the board, so a hint shows the next step instead of a random square.
 */
export function hint(game: Game): Hint | null {
  const { puzzle } = game;
  const wrong = mistakes(game);
  if (wrong.length) return { index: wrong[0], digit: puzzle.solution[wrong[0]], fix: true };
  const step = next_deduction(puzzle, game.values);
  if (step) return { ...step, fix: false };
  const index = game.values.findIndex((value) => !value);
  return index >= 0 ? { index, digit: puzzle.solution[index], fix: false } : null;
}

export function digit_counts(game: Game): number[] {
  const counts = new Array<number>(game.puzzle.size + 1).fill(0);
  for (const value of game.values) if (value) counts[value]++;
  return counts;
}

export interface SizeRecord {
  solved: number;
  /** Fastest solve without hints, in milliseconds. */
  best: number | null;
}
export type Stats = Record<Size, SizeRecord>;

const record_schema = z.object({ solved: z.number().int().nonnegative(), best: z.number().nonnegative().nullable() });
export const stats_schema = z.object({ "4": record_schema, "5": record_schema, "6": record_schema, "7": record_schema });

export function empty_stats(): Stats {
  return {
    "4": { solved: 0, best: null },
    "5": { solved: 0, best: null },
    "6": { solved: 0, best: null },
    "7": { solved: 0, best: null },
  };
}

export function record(stats: Stats, size: Size, time: number, hints: number): Stats {
  const current = stats[size];
  const best = hints === 0 && (current.best === null || time < current.best) ? time : current.best;
  return { ...stats, [size]: { solved: current.solved + 1, best } };
}

/** The puzzle is its seed, so a save is only the player's digits and notes on top of it. */
export const saved_schema = z.object({
  size: size_schema,
  seed: z.number().int().nonnegative(),
  values: z.array(z.number().int().min(0).max(7)),
  notes: z.array(z.number().int().nonnegative()),
  hints: z.number().int().nonnegative(),
  elapsed: z.number().nonnegative(),
});
export type Saved = z.infer<typeof saved_schema>;

export function to_saved(game: Game, size: Size, elapsed: number): Saved {
  return { size, seed: game.puzzle.seed, values: [...game.values], notes: [...game.notes], hints: game.hints, elapsed };
}

export function restore(saved: Saved): Game | null {
  const game = new_game(saved.size, saved.seed);
  const cells = game.values.length;
  if (saved.values.length !== cells || saved.notes.length !== cells) return null;
  if (saved.values.some((value) => value > game.puzzle.size)) return null;
  const values = saved.values.map((value, index) => game.puzzle.givens[index] || value);
  return { ...with_cells(game, values, saved.notes), hints: saved.hints };
}

export const DAILY_SIZE = Size.S5;

export function daily_game(day: string): Game {
  return new_game(DAILY_SIZE, daily_seed(day, "futoshiki"));
}

/** A daily puzzle in progress, kept apart from the regular save. */
export const daily_saved_schema = z.object({ day: z.string(), game: saved_schema });
