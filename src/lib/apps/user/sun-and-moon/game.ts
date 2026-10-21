import { across_cells, down_cells } from "$kit/games/grid";
import { daily_seed } from "$kit/games/time";
import { z } from "zod";
import { Axis, Edge, generate, lines_of, Mark, next_step, Rule, type Puzzle, type Step } from "./puzzle";

export const Size = { S6: "6", S8: "8" } as const;
export type Size = (typeof Size)[keyof typeof Size];
export const SIZES: readonly Size[] = Object.values(Size);
export const size_schema = z.enum(Size);

export interface Game {
  puzzle: Puzzle;
  values: readonly Mark[];
  hints: number;
  solved: boolean;
}

export function new_game(size: Size, seed: number): Game {
  const puzzle = generate(Number(size), seed);
  return { puzzle, values: [...puzzle.givens], hints: 0, solved: false };
}

export const SignState = { OPEN: "open", MET: "met", BROKEN: "broken" } as const;
export type SignState = (typeof SignState)[keyof typeof SignState];

function sign_state(edge: Edge, a: Mark, b: Mark): SignState {
  if (edge === Edge.NONE || !a || !b) return SignState.OPEN;
  return (edge === Edge.SAME) === (a === b) ? SignState.MET : SignState.BROKEN;
}

export function sign_states(game: Game): { across: SignState[]; down: SignState[] } {
  const { size, across, down } = game.puzzle;
  const state = (edge: Edge, [a, b]: [number, number]) => sign_state(edge, game.values[a], game.values[b]);
  return {
    across: across.map((edge, index) => state(edge, across_cells(size, index))),
    down: down.map((edge, index) => state(edge, down_cells(size, index))),
  };
}

export function conflicts(game: Game): Set<number> {
  const { puzzle, values } = game;
  const found = new Set<number>();
  const half = puzzle.size / 2;
  for (const line of lines_of(puzzle)) {
    for (const mark of [Mark.SUN, Mark.MOON]) {
      const cells = line.cells.filter((cell) => values[cell] === mark);
      if (cells.length > half) cells.forEach((cell) => found.add(cell));
    }
    for (let i = 2; i < line.cells.length; i++) {
      const run = line.cells.slice(i - 2, i + 1);
      if (values[run[0]] && run.every((cell) => values[cell] === values[run[0]])) run.forEach((cell) => found.add(cell));
    }
  }
  const signs = sign_states(game);
  const mark = (states: SignState[], cells: (index: number) => [number, number]) =>
    states.forEach((state, index) => state === SignState.BROKEN && cells(index).forEach((cell) => found.add(cell)));
  mark(signs.across, (index) => across_cells(puzzle.size, index));
  mark(signs.down, (index) => down_cells(puzzle.size, index));
  return found;
}

/** A full grid with no broken rule is the solution: generated puzzles have only one. */
export function is_solved(game: Game): boolean {
  return game.values.every(Boolean) && conflicts(game).size === 0;
}

export function with_values(game: Game, values: readonly Mark[]): Game {
  const next = { ...game, values };
  return { ...next, solved: is_solved(next) };
}

export function place(game: Game, index: number, mark: Mark): Game {
  if (game.puzzle.givens[index] || game.values[index] === mark) return game;
  const values = [...game.values];
  values[index] = mark;
  return with_values(game, values);
}

export function cycle(game: Game, index: number): Game {
  const next = [Mark.SUN, Mark.MOON, Mark.EMPTY][game.values[index]];
  return place(game, index, next);
}

export function mistakes(game: Game): number[] {
  return game.values.flatMap((value, index) => (value && value !== game.puzzle.solution[index] ? [index] : []));
}

export interface Hint {
  index: number;
  mark: Mark;
  fix: boolean;
  reason: string;
}

export const mark_name = (mark: Mark) => (mark === Mark.SUN ? "sun" : mark === Mark.MOON ? "moon" : "empty");

const line_name = (step: Step) => `${step.line.axis === Axis.ROW ? "Row" : "Column"} ${step.line.at + 1}`;

export function reason(step: Step, size: number): string {
  const mark = mark_name(step.mark);
  const other = step.mark === Mark.SUN ? "moon" : "sun";
  switch (step.rule) {
    case Rule.SIGN:
      return step.edge === Edge.SAME ? `The = sign makes it match its neighbour: a ${mark}` : `The × sign makes it differ from its neighbour: a ${mark}`;
    case Rule.PAIR:
      return `Two ${other}s side by side: a third would make three in a row`;
    case Rule.GAP:
      return `A ${other} on both sides: another would make three in a row`;
    case Rule.COUNT:
      return `${line_name(step)} already has its ${size / 2} ${other}s`;
    case Rule.LINE:
      return `Every way to finish ${line_name(step).toLowerCase()} puts a ${mark} here`;
  }
}

/**
 * First a wrong mark, since everything after it builds on sand. Otherwise the next mark the simplest rule forces from
 * what's on the board, with that rule as the reason.
 */
export function hint(game: Game): Hint | null {
  const { puzzle } = game;
  const wrong = mistakes(game);
  if (wrong.length) return { index: wrong[0], mark: puzzle.solution[wrong[0]], fix: true, reason: "This one was wrong" };
  const step = next_step(puzzle, game.values);
  if (step) return { index: step.index, mark: step.mark, fix: false, reason: reason(step, puzzle.size) };
  const index = game.values.findIndex((value) => !value);
  return index >= 0 ? { index, mark: puzzle.solution[index], fix: false, reason: "Placed from the solution" } : null;
}

export interface SizeRecord {
  solved: number;
  best: number | null;
}
export type Stats = Record<Size, SizeRecord>;

const record_schema = z.object({ solved: z.number().int().nonnegative(), best: z.number().nonnegative().nullable() });
export const stats_schema = z.object({ "6": record_schema, "8": record_schema });

export function empty_stats(): Stats {
  return { "6": { solved: 0, best: null }, "8": { solved: 0, best: null } };
}

export function record(stats: Stats, size: Size, time: number, hints: number): Stats {
  const current = stats[size];
  const best = hints === 0 && (current.best === null || time < current.best) ? time : current.best;
  return { ...stats, [size]: { solved: current.solved + 1, best } };
}

/** The puzzle is its seed, so a save is only the player's marks on top of it. */
export const saved_schema = z.object({
  size: size_schema,
  seed: z.number().int().nonnegative(),
  values: z.array(z.union([z.literal(Mark.EMPTY), z.literal(Mark.SUN), z.literal(Mark.MOON)])),
  hints: z.number().int().nonnegative(),
  elapsed: z.number().nonnegative(),
});
export type Saved = z.infer<typeof saved_schema>;

export function to_saved(game: Game, size: Size, elapsed: number): Saved {
  return { size, seed: game.puzzle.seed, values: [...game.values], hints: game.hints, elapsed };
}

export function restore(saved: Saved): Game | null {
  const game = new_game(saved.size, saved.seed);
  if (saved.values.length !== game.values.length) return null;
  const values = saved.values.map((value, index) => game.puzzle.givens[index] || value);
  return { ...with_values(game, values), hints: saved.hints };
}

export const DAILY_SIZE = Size.S6;

export function daily_game(day: string): Game {
  return new_game(DAILY_SIZE, daily_seed(day, "sun-and-moon"));
}

export const daily_saved_schema = z.object({ day: z.string(), game: saved_schema });
