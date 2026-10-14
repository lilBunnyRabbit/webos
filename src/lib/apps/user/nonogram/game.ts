import { z } from "zod";
import {
  any_of,
  BW_PALETTE,
  clue_of,
  col_of,
  color_bit,
  EMPTY_BIT,
  from_solution,
  generate,
  GENERATED_PALETTE,
  is_settled,
  row_of,
  same_clue,
  solve_line,
  type Clue,
  type Puzzle,
} from "./puzzle";

export const Size = { S5: "5", S10: "10", S15: "15", S20: "20" } as const;
export type Size = (typeof Size)[keyof typeof Size];
export const SIZES: readonly Size[] = Object.values(Size);
export const size_schema = z.enum(Size);

export const Mode = { BW: "bw", COLOR: "color" } as const;
export type Mode = (typeof Mode)[keyof typeof Mode];
export const mode_schema = z.enum(Mode);

/** A player's mark: blank, crossed, or a colour (1… into the palette; black and white has only 1). */
export const Mark = { EMPTY: 0, FILLED: 1, CROSSED: -1 } as const;
export type Mark = number;

export const DAILY_SIZE: Size = Size.S10;

export interface Game {
  puzzle: Puzzle;
  marks: readonly Mark[];
  hints: number;
  solved: boolean;
}

/** Colour puzzles get two to four colours, picked by the seed so a seed stays the whole puzzle. */
export function palette_for(mode: Mode, seed: number) {
  return mode === Mode.COLOR ? GENERATED_PALETTE.slice(0, 2 + (seed % 3)) : BW_PALETTE;
}

export function new_game(size: Size, seed: number, mode: Mode = Mode.BW): Game {
  const side = Number(size);
  return start(generate(side, side, seed, palette_for(mode, seed)));
}

export function start(puzzle: Puzzle): Game {
  return { puzzle, marks: new Array(puzzle.width * puzzle.height).fill(Mark.EMPTY), hints: 0, solved: false };
}

export function game_of(drawing: { width: number; height: number; palette: Puzzle["palette"]; cells: readonly number[] }): Game {
  return start(from_solution(0, drawing.width, drawing.height, drawing.palette, drawing.cells));
}

/** A line's clue is met when its coloured cells make exactly those runs; crosses don't matter. */
export function line_done(clue: Clue, marks: readonly Mark[]): boolean {
  return same_clue(clue_of(marks), clue);
}

/**
 * Which clue numbers are settled: runs closed off by crosses, the edge or another colour, matched in order from either
 * end. Only a run the player has walled in counts, so a dimmed number never hides a guess.
 */
export function runs_done(clue: Clue, marks: readonly Mark[]): boolean[] {
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
      const color = marks[i];
      let end = i;
      while (end >= 0 && end < n && marks[end] === color) end += step;
      if (end >= 0 && end < n && marks[end] === Mark.EMPTY) break;
      if (Math.abs(end - i) !== clue[j].length || clue[j].color !== color) break;
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

/** Every clue met counts as solved, even on a drawn puzzle with more than one answer. */
export function is_solved(game: Game): boolean {
  return rows_done(game).every(Boolean) && cols_done(game).every(Boolean);
}

export function with_marks(game: Game, marks: readonly Mark[]): Game {
  const next = { ...game, marks };
  return { ...next, solved: is_solved(next) };
}

/** Wrong marks: a colour where the solution has another or none, or a cross on a cell that should be coloured. */
export function mistakes(game: Game): number[] {
  return game.marks.flatMap((mark, index) => {
    const answer = game.puzzle.solution[index];
    return (mark > 0 && mark !== answer) || (mark === Mark.CROSSED && answer > 0) ? [index] : [];
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
  const answer = (index: number): Mark => (puzzle.solution[index] > 0 ? puzzle.solution[index] : Mark.CROSSED);
  if (wrong.length) return { index: wrong[0], mark: answer(wrong[0]), fix: true };

  const all = any_of(puzzle.palette.length);
  const known = game.marks.map((mark) => (mark > 0 ? color_bit(mark) : mark === Mark.CROSSED ? EMPTY_BIT : all));
  const open = (index: number) => game.marks[index] === Mark.EMPTY;
  for (let row = 0; row < puzzle.height; row++) {
    const line = solve_line(puzzle.rows[row], row_of(known, puzzle.width, row));
    const col = line?.findIndex((cell, c) => is_settled(cell) && open(row * puzzle.width + c)) ?? -1;
    if (col >= 0) return { index: row * puzzle.width + col, mark: answer(row * puzzle.width + col), fix: false };
  }
  for (let col = 0; col < puzzle.width; col++) {
    const line = solve_line(puzzle.cols[col], col_of(known, puzzle.width, puzzle.height, col));
    const row = line?.findIndex((cell, r) => is_settled(cell) && open(r * puzzle.width + col)) ?? -1;
    if (row >= 0) return { index: row * puzzle.width + col, mark: answer(row * puzzle.width + col), fix: false };
  }
  const index = game.marks.findIndex((mark, i) => mark === Mark.EMPTY && puzzle.solution[i] > 0);
  return index >= 0 ? { index, mark: puzzle.solution[index], fix: false } : null;
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
 * mark. Neither touches other marks, so dragging across a row of crosses to fill never wipes them. `overwrite` (the
 * editor) paints over other colours too, and painting EMPTY clears everything it crosses.
 */
export function paint(base: readonly Mark[], cells: readonly number[], mark: Mark, erase: boolean, overwrite = false): Mark[] {
  const next = [...base];
  for (const index of cells) {
    if (mark === Mark.EMPTY) next[index] = Mark.EMPTY;
    else if (erase) {
      if (base[index] === mark) next[index] = Mark.EMPTY;
    } else if (base[index] === Mark.EMPTY || (overwrite && base[index] !== mark)) next[index] = mark;
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

/**
 * The puzzle itself is its seed, so a save is only the player's marks on top of it. Saves from before colour mode
 * have no `mode` and stored a cross as 2.
 */
export const saved_schema = z.object({
  size: size_schema,
  mode: mode_schema.optional(),
  seed: z.number().int().nonnegative(),
  marks: z.array(z.number().int().min(-1).max(4)),
  hints: z.number().int().nonnegative(),
  elapsed: z.number().nonnegative(),
});
export type Saved = z.infer<typeof saved_schema>;

export function restore(saved: Saved): Game | null {
  const game = new_game(saved.size, saved.seed, saved.mode ?? Mode.BW);
  const marks = saved.mode ? saved.marks : saved.marks.map((mark) => (mark === 2 ? Mark.CROSSED : mark));
  return resume(game, marks, saved.hints);
}

/** Marks back onto a known puzzle, or null when they don't fit it (another size, a colour it doesn't have). */
export function resume(game: Game, marks: readonly number[], hints: number): Game | null {
  const colors = game.puzzle.palette.length;
  if (marks.length !== game.marks.length || marks.some((mark) => mark > colors)) return null;
  return { ...with_marks(game, marks), hints };
}

/** Progress on a puzzle that isn't a seed (a file, the daily), kept with the window. */
export const progress_schema = z.object({
  key: z.string(),
  marks: z.array(z.number().int().min(-1).max(4)),
  hints: z.number().int().nonnegative(),
  elapsed: z.number().nonnegative(),
});
export type Progress = z.infer<typeof progress_schema>;
