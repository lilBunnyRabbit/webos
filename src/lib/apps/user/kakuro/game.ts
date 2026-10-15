import { daily_seed } from "$lib/core/games/time";
import { z } from "zod";
import { bit, combos, deduce, digits_of, generate, type Puzzle, type Run } from "./puzzle";

export const Size = { S6: "6", S8: "8", S10: "10", S12: "12" } as const;
export type Size = (typeof Size)[keyof typeof Size];
export const SIZES: readonly Size[] = Object.values(Size);
export const size_schema = z.enum(Size);

export interface Game {
  puzzle: Puzzle;
  /** Row-major, 0 for empty (and for black cells). */
  values: readonly number[];
  /** Pencil marks per cell as a digit mask. */
  notes: readonly number[];
  hints: number;
  solved: boolean;
}

export function new_game(size: Size, seed: number): Game {
  const puzzle = generate(Number(size), seed);
  const empty = new Array<number>(puzzle.solution.length).fill(0);
  return { puzzle, values: empty, notes: empty, hints: 0, solved: false };
}

export const RunState = { OPEN: 0, DONE: 1, WRONG: 2 } as const;
export type RunState = (typeof RunState)[keyof typeof RunState];

/** Wrong as soon as a digit repeats or the sum is reached with cells left, and when full but off its sum. */
export function run_state(run: Run, values: readonly number[]): RunState {
  let seen = 0;
  let sum = 0;
  let full = true;
  for (const cell of run.cells) {
    const digit = values[cell];
    if (!digit) {
      full = false;
      continue;
    }
    if (seen & bit(digit)) return RunState.WRONG;
    seen |= bit(digit);
    sum += digit;
  }
  if (!full) return sum >= run.sum ? RunState.WRONG : RunState.OPEN;
  return sum === run.sum ? RunState.DONE : RunState.WRONG;
}

export function run_states(game: Game): RunState[] {
  return game.puzzle.runs.map((run) => run_state(run, game.values));
}

export function conflicts(game: Game): Set<number> {
  const cells = new Set<number>();
  for (const run of game.puzzle.runs) {
    for (const a of run.cells) {
      if (game.values[a] && run.cells.some((b) => b !== a && game.values[b] === game.values[a])) cells.add(a);
    }
  }
  return cells;
}

/** Every run full, without repeats and on its sum. Generated puzzles have one solution, so that's the one. */
export function is_solved(game: Pick<Game, "puzzle" | "values">): boolean {
  return game.puzzle.runs.every((run) => run_state(run, game.values) === RunState.DONE);
}

export function with_entries(game: Game, values: readonly number[], notes: readonly number[] = game.notes): Game {
  return { ...game, values, notes, solved: is_solved({ puzzle: game.puzzle, values }) };
}

export function is_white(puzzle: Puzzle, cell: number): boolean {
  return puzzle.across_of[cell] >= 0;
}

export function first_white(puzzle: Puzzle): number {
  return puzzle.across_of.findIndex((run) => run >= 0);
}

/** The first white cell past `from` going (`d_row`, `d_col`), jumping black ones; `from` at the edge. */
export function step_white(puzzle: Puzzle, from: number, d_row: number, d_col: number): number {
  const side = puzzle.size;
  let row = Math.floor(from / side) + d_row;
  let col = (from % side) + d_col;
  while (row >= 0 && row < side && col >= 0 && col < side) {
    if (is_white(puzzle, row * side + col)) return row * side + col;
    row += d_row;
    col += d_col;
  }
  return from;
}

/** Where arrow keys, Home and End take the cursor from `from`, landing only on white cells; null for other keys. */
export function key_move(puzzle: Puzzle, key: string, from: number): number | null {
  const side = puzzle.size;
  const row_start = Math.floor(from / side) * side;
  const row_end = row_start + side - 1;
  switch (key) {
    case "ArrowUp":
      return step_white(puzzle, from, -1, 0);
    case "ArrowDown":
      return step_white(puzzle, from, 1, 0);
    case "ArrowLeft":
      return step_white(puzzle, from, 0, -1);
    case "ArrowRight":
      return step_white(puzzle, from, 0, 1);
    case "Home":
      return step_white(puzzle, row_start, 0, 1);
    case "End":
      return is_white(puzzle, row_end) ? row_end : step_white(puzzle, row_end, 0, -1);
    default:
      return null;
  }
}

/** The runs each clue cell heads, by index into `puzzle.runs`. */
export function clue_runs(puzzle: Puzzle): Map<number, { across?: number; down?: number }> {
  const map = new Map<number, { across?: number; down?: number }>();
  puzzle.runs.forEach((run, index) => {
    const entry = map.get(run.clue) ?? {};
    if (run.across) entry.across = index;
    else entry.down = index;
    map.set(run.clue, entry);
  });
  return map;
}

export function peers(puzzle: Puzzle, cell: number): number[] {
  const across = puzzle.runs[puzzle.across_of[cell]]?.cells ?? [];
  const down = puzzle.runs[puzzle.down_of[cell]]?.cells ?? [];
  return [...across, ...down].filter((other) => other !== cell);
}

/** Placing a digit erases it from the pencil marks of the cell's runs, as most puzzle apps do: it can't go there now. */
export function place(game: Game, cell: number, digit: number): Pick<Game, "values" | "notes"> {
  const values = [...game.values];
  const notes = [...game.notes];
  values[cell] = digit;
  for (const other of peers(game.puzzle, cell)) notes[other] &= ~bit(digit);
  return { values, notes };
}

export function toggle_note(game: Game, cell: number, digit: number): Pick<Game, "values" | "notes"> {
  const notes = [...game.notes];
  notes[cell] ^= bit(digit);
  return { values: game.values, notes };
}

export function clear(game: Game, cell: number): Pick<Game, "values" | "notes"> {
  const values = [...game.values];
  const notes = [...game.notes];
  if (values[cell]) values[cell] = 0;
  else notes[cell] = 0;
  return { values, notes };
}

export function mistakes(game: Game): number[] {
  return game.values.flatMap((digit, cell) => (digit && digit !== game.puzzle.solution[cell] ? [cell] : []));
}

export interface Hint {
  cell: number;
  digit: number;
  /** True when the hint corrects a wrong digit rather than filling an empty cell. */
  fix: boolean;
}

/** A wrong digit first, since everything after it builds on sand; otherwise the next cell reasoning gives. */
export function hint(game: Game): Hint | null {
  const { puzzle } = game;
  const wrong = mistakes(game);
  if (wrong.length) return { cell: wrong[0], digit: puzzle.solution[wrong[0]], fix: true };
  const next = deduce(puzzle, game.values);
  if (next) return { ...next, fix: false };
  const cell = game.values.findIndex((digit, index) => !digit && is_white(puzzle, index));
  return cell >= 0 ? { cell, digit: puzzle.solution[cell], fix: false } : null;
}

/** The digit sets that can still make this run: each holds every digit already entered, and is "8+9"-style text. */
export function run_combos(run: Run, values: readonly number[]): string[] {
  let entered = 0;
  for (const cell of run.cells) if (values[cell]) entered |= bit(values[cell]);
  return combos(run.cells.length, run.sum)
    .filter((combo) => (combo & entered) === entered)
    .map((combo) => digits_of(combo).join("+"))
    .sort();
}

export function combos_text(run: Run, values: readonly number[], max: number): string {
  const all = run_combos(run, values);
  if (!all.length) return "no combination fits";
  const shown = all.slice(0, max).join("  ");
  return all.length > max ? `${shown}  +${all.length - max}` : shown;
}

export interface SizeRecord {
  solved: number;
  /** Fastest solve without hints, in milliseconds. */
  best: number | null;
}
export type Stats = Record<Size, SizeRecord>;

const record_schema = z.object({ solved: z.number().int().nonnegative(), best: z.number().nonnegative().nullable() });
export const stats_schema = z.object({
  "6": record_schema,
  "8": record_schema,
  "10": record_schema,
  "12": record_schema,
});

export function empty_stats(): Stats {
  return {
    "6": { solved: 0, best: null },
    "8": { solved: 0, best: null },
    "10": { solved: 0, best: null },
    "12": { solved: 0, best: null },
  };
}

export function record(stats: Stats, size: Size, time: number, hints: number): Stats {
  const current = stats[size];
  const best = hints === 0 && (current.best === null || time < current.best) ? time : current.best;
  return { ...stats, [size]: { solved: current.solved + 1, best } };
}

/** The puzzle itself is its seed, so a save is only the player's digits and marks on top of it. */
export const saved_schema = z.object({
  size: size_schema,
  seed: z.number().int().nonnegative(),
  values: z.array(z.number().int().min(0).max(9)),
  notes: z.array(z.number().int().min(0).max(0x1ff)),
  hints: z.number().int().nonnegative(),
  elapsed: z.number().nonnegative(),
});
export type Saved = z.infer<typeof saved_schema>;

export function restore(saved: Saved): Game | null {
  const game = new_game(saved.size, saved.seed);
  if (saved.values.length !== game.values.length || saved.notes.length !== game.notes.length) return null;
  return { ...with_entries(game, saved.values, saved.notes), hints: saved.hints };
}

export const DAILY_SIZE = Size.S8;

export function daily_game(day: string): Game {
  return new_game(DAILY_SIZE, daily_seed(day, "kakuro"));
}

/** A daily puzzle in progress, kept apart from the regular save. */
export const daily_saved_schema = z.object({ day: z.string(), game: saved_schema });
