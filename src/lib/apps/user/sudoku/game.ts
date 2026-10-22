import { daily_key } from "$kit/games/daily";
import { daily_seed } from "$kit/games/time";
import { z } from "zod";
import {
  bit,
  candidates,
  count_bits,
  DIFFICULTIES,
  Difficulty,
  generate,
  next_deduction,
  shape_of,
  SHAPES,
  Size,
  SIZES,
  type Puzzle,
  type Technique,
} from "./puzzle";
import { SIZE_LABELS } from "./size";

export { Difficulty, DIFFICULTIES, Size, SIZE_LABELS, SIZES };
export const difficulty_schema = z.enum(Difficulty);
export const size_schema = z.enum(Size);

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
  expert: "Expert",
};

export interface Board {
  values: readonly number[];
  notes: readonly number[];
}

export interface Game extends Board {
  size: Size;
  difficulty: Difficulty;
  puzzle: Puzzle;
  hints: number;
  solved: boolean;
}

export function new_game(difficulty: Difficulty, seed: number, size: Size = Size.NINE): Game {
  const puzzle = generate(difficulty, seed, size);
  const notes = new Array(puzzle.givens.length).fill(0);
  return { size, difficulty, puzzle, values: [...puzzle.givens], notes, hints: 0, solved: false };
}

export function is_given(game: Game, cell: number): boolean {
  return game.puzzle.givens[cell] !== 0;
}

/** A full grid without conflicts is the solution: generated puzzles have only one. */
export function is_solved(values: readonly number[]): boolean {
  return values.every(Boolean) && conflicts(values).size === 0;
}

export function with_board(game: Game, board: Board): Game {
  return { ...game, values: board.values, notes: board.notes, solved: is_solved(board.values) };
}

export function conflicts(values: readonly number[]): Set<number> {
  const { peers } = shape_of(values);
  const found = new Set<number>();
  for (let cell = 0; cell < values.length; cell++) {
    const value = values[cell];
    if (value && peers[cell].some((peer) => values[peer] === value)) found.add(cell);
  }
  return found;
}

/** Index 0 is unused so a digit indexes its own count. */
export function digit_counts(values: readonly number[]): number[] {
  const counts = new Array(10).fill(0);
  for (const value of values) if (value) counts[value]++;
  return counts;
}

/**
 * Writes `digit` into a blank or player-filled cell, or clears it when it already holds that digit. Placing a digit
 * also removes it from the notes it now rules out, the way every modern app keeps candidates honest.
 */
export function place(game: Game, cell: number, digit: number): Board {
  if (is_given(game, cell)) return game;
  const values = [...game.values];
  const notes = [...game.notes];
  if (values[cell] === digit) {
    values[cell] = 0;
    return { values, notes };
  }
  values[cell] = digit;
  notes[cell] = 0;
  for (const peer of shape_of(values).peers[cell]) notes[peer] &= ~bit(digit);
  return { values, notes };
}

export function toggle_note(game: Game, cell: number, digit: number): Board {
  if (game.values[cell]) return game;
  const notes = [...game.notes];
  notes[cell] ^= bit(digit);
  return { values: game.values, notes };
}

export function erase(game: Game, cell: number): Board {
  if (is_given(game, cell)) return game;
  const values = [...game.values];
  const notes = [...game.notes];
  if (values[cell]) values[cell] = 0;
  else notes[cell] = 0;
  return { values, notes };
}

export function auto_notes(game: Game): Board {
  return { values: game.values, notes: candidates(game.values) };
}

export function same_board(a: Board, b: Board): boolean {
  return a.values.every((value, i) => value === b.values[i]) && a.notes.every((note, i) => note === b.notes[i]);
}

export function completed_units(before: readonly number[], after: readonly number[], cell: number): number[][] {
  const { size, units: all, row, col, box } = shape_of(after);
  const units = [all[row[cell]], all[size + col[cell]], all[2 * size + box[cell]]];
  const complete = (values: readonly number[], unit: readonly number[]) =>
    unit.every((c) => values[c]) && new Set(unit.map((c) => values[c])).size === size;
  return units.filter((unit) => complete(after, unit) && !complete(before, unit)).map((unit) => [...unit]);
}

/** How long each cell of the finished units waits before it lights up: a wave spreading out from `origin`. */
export function wave_delays(
  units: readonly (readonly number[])[],
  origin: number,
  side = 9,
  step_ms = 45
): Map<number, number> {
  const delays = new Map<number, number>();
  const row_of = (cell: number) => Math.floor(cell / side);
  const col_of = (cell: number) => cell % side;
  for (const unit of units) {
    for (const cell of unit) {
      const distance = Math.abs(row_of(cell) - row_of(origin)) + Math.abs(col_of(cell) - col_of(origin));
      delays.set(cell, Math.min(delays.get(cell) ?? Infinity, distance * step_ms));
    }
  }
  return delays;
}

/** Where the cursor starts: the first blank cell, else the centre. */
export function first_blank(values: readonly number[]): number {
  const index = values.findIndex((value) => !value);
  return index < 0 ? Math.floor(values.length / 2) : index;
}

export const HintKind = { FIX: "fix", DEDUCE: "deduce", REVEAL: "reveal" } as const;
export type HintKind = (typeof HintKind)[keyof typeof HintKind];

export interface Hint {
  cell: number;
  digit: number;
  kind: HintKind;
  technique?: Technique;
}

/**
 * A wrong entry first, since everything after it builds on sand. Otherwise the next placement logic proves, named by
 * the technique that unlocks it. When logic is stuck (expert puzzles go past its techniques), the blank cell with the
 * fewest candidates is revealed.
 */
export function hint(game: Game): Hint | null {
  const { solution } = game.puzzle;
  const wrong = game.values.findIndex((value, cell) => value !== 0 && value !== solution[cell]);
  if (wrong >= 0) return { cell: wrong, digit: solution[wrong], kind: HintKind.FIX };
  const deduction = next_deduction(game.values);
  if (deduction)
    return { cell: deduction.cell, digit: deduction.digit, kind: HintKind.DEDUCE, technique: deduction.technique };
  const cands = candidates(game.values);
  let best = -1;
  for (let cell = 0; cell < game.values.length; cell++) {
    if (!game.values[cell] && (best < 0 || count_bits(cands[cell]) < count_bits(cands[best]))) best = cell;
  }
  return best >= 0 ? { cell: best, digit: solution[best], kind: HintKind.REVEAL } : null;
}

export function apply_hint(game: Game, next: Hint): Board {
  const values = [...game.values];
  values[next.cell] = 0;
  return place({ ...game, values }, next.cell, next.digit);
}

export function cell_name(cell: number, side = 9): string {
  return `row ${Math.floor(cell / side) + 1}, column ${(cell % side) + 1}`;
}

export interface DifficultyRecord {
  solved: number;
  best: number | null;
}
export type Stats = Record<Difficulty, DifficultyRecord>;

const record_schema = z.object({ solved: z.number().int().nonnegative(), best: z.number().nonnegative().nullable() });
export const stats_schema = z.object({
  easy: record_schema,
  medium: record_schema,
  hard: record_schema,
  expert: record_schema,
});

export function empty_stats(): Stats {
  return {
    easy: { solved: 0, best: null },
    medium: { solved: 0, best: null },
    hard: { solved: 0, best: null },
    expert: { solved: 0, best: null },
  };
}

export function record(stats: Stats, difficulty: Difficulty, time: number, hints: number): Stats {
  const current = stats[difficulty];
  const best = hints === 0 && (current.best === null || time < current.best) ? time : current.best;
  return { ...stats, [difficulty]: { solved: current.solved + 1, best } };
}

/** The puzzle is its seed, so a save is only the player's values and notes on top of it. Saves from before 6×6 have no size. */
export const saved_schema = z
  .object({
    size: size_schema.default(Size.NINE),
    difficulty: difficulty_schema,
    seed: z.number().int().nonnegative(),
    values: z.array(z.number().int().min(0).max(9)),
    notes: z.array(z.number().int().min(0).max(0x1ff)),
    hints: z.number().int().nonnegative(),
    elapsed: z.number().nonnegative(),
  })
  .refine(({ size, values, notes }) => values.length === SHAPES[size].cells && notes.length === SHAPES[size].cells);
export type Saved = z.infer<typeof saved_schema>;

export function to_saved(game: Game, elapsed: number): Saved {
  return {
    size: game.size,
    difficulty: game.difficulty,
    seed: game.puzzle.seed,
    values: [...game.values],
    notes: [...game.notes],
    hints: game.hints,
    elapsed,
  };
}

export function restore(saved: Saved): Game | null {
  const game = new_game(saved.difficulty, saved.seed, saved.size);
  if (game.puzzle.givens.some((given, cell) => given && saved.values[cell] !== given)) return null;
  return { ...with_board(game, { values: saved.values, notes: saved.notes }), hints: saved.hints };
}

export const DAILY_DIFFICULTY = Difficulty.MEDIUM;

/**
 * Each size is its own daily (a mode in Game Hub). The 9×9 seed stays on the bare app id, so its dailies are the ones
 * played before 6×6 existed.
 */
export function daily_game(day: string, size: Size = Size.NINE): Game {
  const seed = daily_seed(day, size === Size.NINE ? "sudoku" : daily_key("sudoku", size));
  return new_game(DAILY_DIFFICULTY, seed, size);
}

/** A daily puzzle in progress, kept apart from the regular save. */
export const daily_saved_schema = z.object({ day: z.string(), game: saved_schema });
