import { daily_seed } from "$kit/games/time";
import { z } from "zod";
import {
  area_of,
  contains,
  fits,
  generate,
  next_step,
  overlaps,
  rect_cells,
  Rule,
  same_rect,
  Shape,
  shape_of,
  type Clue,
  type Puzzle,
  type Rect,
} from "./puzzle";

export const Size = { S6: "6", S7: "7", S8: "8", S9: "9" } as const;
export type Size = (typeof Size)[keyof typeof Size];
export const SIZES: readonly Size[] = Object.values(Size);
export const size_schema = z.enum(Size);

export interface Game {
  puzzle: Puzzle;
  plots: readonly Rect[];
  hints: number;
  solved: boolean;
}

export function new_game(size: Size, seed: number): Game {
  return { puzzle: generate(Number(size), seed), plots: [], hints: 0, solved: false };
}

export function clues_in(puzzle: Puzzle, rect: Rect): number[] {
  return puzzle.clues.flatMap((clue, index) => (contains(rect, puzzle.size, clue.cell) ? [index] : []));
}

export const Problem = { NO_CLUE: "no-clue", CLUES: "clues", AREA: "area", SHAPE: "shape" } as const;
export type Problem = (typeof Problem)[keyof typeof Problem];

/** What's wrong with a plot by the rules alone, never by the answer: null when its one clue is satisfied. */
export function problem_of(puzzle: Puzzle, rect: Rect): Problem | null {
  const inside = clues_in(puzzle, rect);
  if (!inside.length) return Problem.NO_CLUE;
  if (inside.length > 1) return Problem.CLUES;
  const clue = puzzle.clues[inside[0]];
  if (clue.area !== null && area_of(rect) !== clue.area) return Problem.AREA;
  return fits(clue, rect) ? null : Problem.SHAPE;
}

export function cell_plots(size: number, plots: readonly Rect[]): number[] {
  const owner = new Array<number>(size * size).fill(-1);
  plots.forEach((rect, index) => rect_cells(rect, size).forEach((cell) => (owner[cell] = index)));
  return owner;
}

export function plot_at(plots: readonly Rect[], size: number, cell: number): number {
  return plots.findIndex((rect) => contains(rect, size, cell));
}

/** Placing a plot replaces every plot it overlaps, so plots never stack. */
export function place(plots: readonly Rect[], rect: Rect): Rect[] {
  return [...plots.filter((other) => !overlaps(other, rect)), rect];
}

export function remove(plots: readonly Rect[], index: number): Rect[] {
  return plots.filter((_, at) => at !== index);
}

/** Every cell covered and no plot breaks a rule: that's the answer, since a generated puzzle has only one. */
export function is_solved(puzzle: Puzzle, plots: readonly Rect[]): boolean {
  const area = plots.reduce((sum, rect) => sum + area_of(rect), 0);
  return area === puzzle.size * puzzle.size && plots.every((rect) => problem_of(puzzle, rect) === null);
}

export function with_plots(game: Game, plots: readonly Rect[]): Game {
  return { ...game, plots, solved: is_solved(game.puzzle, plots) };
}

export function mistakes(game: Game): number[] {
  return game.plots.flatMap((rect, index) => (game.puzzle.solution.some((answer) => same_rect(answer, rect)) ? [] : [index]));
}

export interface Hint {
  /** The plot to place, or null when the hint takes away the wrong plot at `remove`. */
  rect: Rect | null;
  remove: number | null;
  cells: number[];
  reason: string;
  fix: boolean;
}

function where(size: number, clue: Clue): string {
  return `row ${Math.floor(clue.cell / size) + 1}, column ${(clue.cell % size) + 1}`;
}

/**
 * A wrong plot first: it's taken away, since everything after it builds on it. Otherwise the next plot the deduction
 * rules prove from the right ones, and if they stall (not expected: every puzzle is solvable by them from empty),
 * one plot of the answer.
 */
export function hint(game: Game): Hint | null {
  const { puzzle, plots } = game;
  const { size } = puzzle;
  const wrong = mistakes(game);
  if (wrong.length) {
    const rect = plots[wrong[0]];
    return { rect: null, remove: wrong[0], cells: rect_cells(rect, size), reason: "This plot isn't part of the answer, so it's gone.", fix: true };
  }

  const placed = puzzle.solution.map((answer) => plots.find((rect) => same_rect(rect, answer)) ?? null);
  const step = next_step(size, puzzle.clues, placed);
  if (step) {
    const at = where(size, puzzle.clues[step.clue]);
    const reason =
      step.rule === Rule.ONLY_FIT
        ? `Only one plot fits the clue at ${at}.`
        : `Every other plot for the clue at ${at} would leave another clue no room or a cell no owner.`;
    return { rect: step.rect, remove: null, cells: rect_cells(step.rect, size), reason, fix: false };
  }

  const missing = puzzle.solution.find((_, index) => !placed[index]);
  return missing
    ? { rect: missing, remove: null, cells: rect_cells(missing, size), reason: "Here's a plot to get you going.", fix: false }
    : null;
}

export function apply_hint(plots: readonly Rect[], next: Hint): Rect[] {
  if (next.rect) return place(plots, next.rect);
  return next.remove === null ? [...plots] : remove(plots, next.remove);
}

export function shape_name(shape: Shape): string {
  if (shape === Shape.SQUARE) return "square";
  if (shape === Shape.TALL) return "taller than wide";
  if (shape === Shape.WIDE) return "wider than tall";
  return "any shape";
}

export function describe_rect(rect: Rect): string {
  return `${rect.width} by ${rect.height}, ${area_of(rect)} cells, ${shape_name(shape_of(rect))}`;
}

export interface SizeRecord {
  solved: number;
  /** Fastest solve without hints, in milliseconds. */
  best: number | null;
}
export type Stats = Record<Size, SizeRecord>;

const record_schema = z.object({ solved: z.number().int().nonnegative(), best: z.number().nonnegative().nullable() });
export const stats_schema = z.object({ "6": record_schema, "7": record_schema, "8": record_schema, "9": record_schema });

export function empty_stats(): Stats {
  return {
    "6": { solved: 0, best: null },
    "7": { solved: 0, best: null },
    "8": { solved: 0, best: null },
    "9": { solved: 0, best: null },
  };
}

export function record(stats: Stats, size: Size, time: number, hints: number): Stats {
  const current = stats[size];
  const best = hints === 0 && (current.best === null || time < current.best) ? time : current.best;
  return { ...stats, [size]: { solved: current.solved + 1, best } };
}

const rect_schema = z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative(), z.number().int().positive(), z.number().int().positive()]);

/** The puzzle is its seed, so a save is only the player's plots on top of it, each `[row, col, width, height]`. */
export const saved_schema = z.object({
  size: size_schema,
  seed: z.number().int().nonnegative(),
  plots: z.array(rect_schema),
  hints: z.number().int().nonnegative(),
  elapsed: z.number().nonnegative(),
});
export type Saved = z.infer<typeof saved_schema>;

export function to_saved(rect: Rect): [number, number, number, number] {
  return [rect.row, rect.col, rect.width, rect.height];
}

export function restore(saved: Saved): Game | null {
  const game = new_game(saved.size, saved.seed);
  const plots = saved.plots.map(([row, col, width, height]) => ({ row, col, width, height }));
  const side = game.puzzle.size;
  if (plots.some((rect) => rect.row + rect.height > side || rect.col + rect.width > side)) return null;
  return { ...with_plots(game, plots), hints: saved.hints };
}

export const DAILY_SIZE = Size.S7;

export function daily_game(day: string): Game {
  return new_game(DAILY_SIZE, daily_seed(day, "plots"));
}

export const daily_saved_schema = z.object({ day: z.string(), game: saved_schema });
