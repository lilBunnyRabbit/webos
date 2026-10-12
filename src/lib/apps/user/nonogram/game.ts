import { z } from "zod";
import { clue_of, col_of, generate, Known, row_of, solve_line, type Puzzle } from "./puzzle";

export const Size = { S5: "5", S10: "10", S15: "15", S20: "20" } as const;
export type Size = (typeof Size)[keyof typeof Size];
export const SIZES: readonly Size[] = Object.values(Size);
export const size_schema = z.enum(Size);

export const Mark = { EMPTY: 0, FILLED: 1, CROSSED: 2 } as const;
export type Mark = (typeof Mark)[keyof typeof Mark];

export interface Game {
  puzzle: Puzzle;
  marks: readonly Mark[];
  hints: number;
  solved: boolean;
}

export function new_game(size: Size, seed: number): Game {
  const side = Number(size);
  const puzzle = generate(side, side, seed);
  return { puzzle, marks: new Array(side * side).fill(Mark.EMPTY), hints: 0, solved: false };
}

/** A line's clue is met when its filled cells make exactly those runs; crosses don't matter. */
export function line_done(clue: readonly number[], marks: readonly Mark[]): boolean {
  const runs = clue_of(marks.map((mark) => mark === Mark.FILLED));
  return runs.length === clue.length && runs.every((run, index) => run === clue[index]);
}

/**
 * Which clue numbers are settled: runs closed off by crosses or the edge, matched in order from either end. Only a run
 * the player has walled in counts, so a dimmed number never hides a guess.
 */
export function runs_done(clue: readonly number[], marks: readonly Mark[]): boolean[] {
  if (line_done(clue, marks)) return clue.map(() => true);
  const done = clue.map(() => false);
  const n = marks.length;
  const settle = (from: number, step: 1 | -1, first: number, stop: number): number => {
    let i = from;
    let j = first;
    while (i >= 0 && i < n && j !== stop) {
      if (marks[i] === Mark.CROSSED) {
        i += step;
        continue;
      }
      if (marks[i] === Mark.EMPTY) break;
      let end = i;
      while (end >= 0 && end < n && marks[end] === Mark.FILLED) end += step;
      if (end >= 0 && end < n && marks[end] === Mark.EMPTY) break;
      if (Math.abs(end - i) !== clue[j]) break;
      done[j] = true;
      j += step;
      i = end;
    }
    return j;
  };
  const reached = settle(0, 1, 0, clue.length);
  settle(n - 1, -1, clue.length - 1, reached - 1);
  return done;
}

export function rows_done(game: Game): boolean[] {
  const { width, height, rows } = game.puzzle;
  return Array.from({ length: height }, (_, row) => line_done(rows[row], row_of(game.marks, width, row)));
}

export function cols_done(game: Game): boolean[] {
  const { width, height, cols } = game.puzzle;
  return Array.from({ length: width }, (_, col) => line_done(cols[col], col_of(game.marks, width, height, col)));
}

/** Every clue met means the picture is the solution: generated puzzles have only one. */
export function is_solved(game: Game): boolean {
  return rows_done(game).every(Boolean) && cols_done(game).every(Boolean);
}

export function with_marks(game: Game, marks: readonly Mark[]): Game {
  const next = { ...game, marks };
  return { ...next, solved: is_solved(next) };
}

/** Wrong marks: a filled cell that should be empty, or a cross on a cell that should be filled. */
export function mistakes(game: Game): number[] {
  return game.marks.flatMap((mark, index) => {
    const filled = game.puzzle.solution[index];
    return (mark === Mark.FILLED && !filled) || (mark === Mark.CROSSED && filled) ? [index] : [];
  });
}

export interface Hint {
  index: number;
  mark: Mark;
  /** True when the hint fixes a wrong mark rather than adding a new one. */
  fix: boolean;
}

/**
 * First a wrong mark, since everything after it builds on sand. Otherwise a cell that line logic proves from the
 * correct marks so far, so a hint teaches the next step instead of giving away a random square.
 */
export function hint(game: Game): Hint | null {
  const wrong = mistakes(game);
  const { puzzle } = game;
  const answer = (index: number): Mark => (puzzle.solution[index] ? Mark.FILLED : Mark.CROSSED);
  if (wrong.length) return { index: wrong[0], mark: answer(wrong[0]), fix: true };

  const known = game.marks.map((mark) =>
    mark === Mark.FILLED ? Known.FILLED : mark === Mark.CROSSED ? Known.EMPTY : Known.UNKNOWN
  );
  const open = (index: number) => game.marks[index] === Mark.EMPTY;
  for (let row = 0; row < puzzle.height; row++) {
    const line = solve_line(puzzle.rows[row], row_of(known, puzzle.width, row));
    const col = line?.findIndex((cell, c) => cell !== Known.UNKNOWN && open(row * puzzle.width + c)) ?? -1;
    if (col >= 0) return { index: row * puzzle.width + col, mark: answer(row * puzzle.width + col), fix: false };
  }
  for (let col = 0; col < puzzle.width; col++) {
    const line = solve_line(puzzle.cols[col], col_of(known, puzzle.width, puzzle.height, col));
    const row = line?.findIndex((cell, r) => cell !== Known.UNKNOWN && open(r * puzzle.width + col)) ?? -1;
    if (row >= 0) return { index: row * puzzle.width + col, mark: answer(row * puzzle.width + col), fix: false };
  }
  const index = game.marks.findIndex((mark, i) => mark === Mark.EMPTY && puzzle.solution[i]);
  return index >= 0 ? { index, mark: Mark.FILLED, fix: false } : null;
}

/** Cells from `from` to `to` along one axis, the way a drag paints: locked to the first direction it moves. */
export function stroke_cells(width: number, from: number, to: number, axis: "row" | "col" | null): number[] {
  const [r0, c0] = [Math.floor(from / width), from % width];
  const [r1, c1] = [Math.floor(to / width), to % width];
  const along_row = axis ? axis === "row" : Math.abs(c1 - c0) >= Math.abs(r1 - r0);
  const cells: number[] = [];
  if (along_row) {
    const step = Math.sign(c1 - c0) || 1;
    for (let c = c0; c !== c1 + step; c += step) cells.push(r0 * width + c);
  } else {
    const step = Math.sign(r1 - r0) || 1;
    for (let r = r0; r !== r1 + step; r += step) cells.push(r * width + c0);
  }
  return cells;
}

/**
 * A stroke either paints `mark` onto blank cells or, when it started on a cell already holding `mark`, erases that
 * mark. Neither touches the other mark, so dragging across a row of crosses to fill never wipes them.
 */
export function paint(base: readonly Mark[], cells: readonly number[], mark: Mark, erase: boolean): Mark[] {
  const next = [...base];
  for (const index of cells) {
    if (erase ? base[index] === mark : base[index] === Mark.EMPTY) next[index] = erase ? Mark.EMPTY : mark;
  }
  return next;
}

export interface SizeRecord {
  solved: number;
  /** Fastest solve without hints, in milliseconds. */
  best: number | null;
}
export type Stats = Record<Size, SizeRecord>;

const record_schema = z.object({ solved: z.number().int().nonnegative(), best: z.number().nonnegative().nullable() });
export const stats_schema = z.object({
  "5": record_schema,
  "10": record_schema,
  "15": record_schema,
  "20": record_schema,
});

export function empty_stats(): Stats {
  return {
    "5": { solved: 0, best: null },
    "10": { solved: 0, best: null },
    "15": { solved: 0, best: null },
    "20": { solved: 0, best: null },
  };
}

export function record(stats: Stats, size: Size, time: number, hints: number): Stats {
  const current = stats[size];
  const best = hints === 0 && (current.best === null || time < current.best) ? time : current.best;
  return { ...stats, [size]: { solved: current.solved + 1, best } };
}

/** The puzzle itself is its seed, so a save is only the player's marks on top of it. */
export const saved_schema = z.object({
  size: size_schema,
  seed: z.number().int().nonnegative(),
  marks: z.array(z.union([z.literal(0), z.literal(1), z.literal(2)])),
  hints: z.number().int().nonnegative(),
  elapsed: z.number().nonnegative(),
});
export type Saved = z.infer<typeof saved_schema>;

export function restore(saved: Saved): Game | null {
  const game = new_game(saved.size, saved.seed);
  if (saved.marks.length !== game.marks.length) return null;
  return { ...with_marks(game, saved.marks), hints: saved.hints };
}

export function format_time(ms: number): string {
  const total = Math.floor(ms / 1000);
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, "0")}`;
}
