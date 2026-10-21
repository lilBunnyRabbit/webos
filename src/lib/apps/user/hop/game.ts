import { grid_walk, orthogonal, path_step, path_walk, type PathRule } from "$kit/games/path";
import { daily_seed } from "$kit/games/time";
import { z } from "zod";
import { dot_cells, generate, open_neighbours, walled, type Puzzle } from "./puzzle";

export const Size = { S6: "6", S7: "7", S8: "8" } as const;
export type Size = (typeof Size)[keyof typeof Size];
export const SIZES: readonly Size[] = Object.values(Size);
export const size_schema = z.enum(Size);

export interface Game {
  puzzle: Puzzle;
  path: readonly number[];
  hints: number;
  solved: boolean;
}

export function new_game(size: Size, seed: number): Game {
  const puzzle = generate(Number(size), seed);
  return { puzzle, path: [dot_cells(puzzle)[0]], hints: 0, solved: false };
}

export function last_dot(puzzle: Puzzle): number {
  return Math.max(...puzzle.numbers);
}

// Dots are reached in order, so the highest one on the path is the last reached.
export function next_dot(puzzle: Puzzle, path: readonly number[]): number {
  let reached = 0;
  for (const cell of path) reached = Math.max(reached, puzzle.numbers[cell]);
  return reached + 1;
}

export const Refusal = { WALL: "wall", ORDER: "order", END: "end", FAR: "far" } as const;
export type Refusal = (typeof Refusal)[keyof typeof Refusal];

export function refusal(puzzle: Puzzle, path: readonly number[], to: number): Refusal | null {
  const from = path[path.length - 1];
  if (!orthogonal(puzzle.size, from, to)) return Refusal.FAR;
  if (walled(puzzle, from, to)) return Refusal.WALL;
  if (puzzle.numbers[from] === last_dot(puzzle)) return Refusal.END;
  const number = puzzle.numbers[to];
  if (number && number !== next_dot(puzzle, path)) return Refusal.ORDER;
  return null;
}

export function step_rule(puzzle: Puzzle): PathRule {
  return (_, to, path) => refusal(puzzle, path, to) === null;
}

export function with_path(game: Game, path: readonly number[]): Game {
  if (path === game.path) return game;
  return { ...game, path, solved: path.length === game.puzzle.size * game.puzzle.size };
}

export function draw_to(game: Game, cell: number): Game {
  const { path, puzzle } = game;
  if (path.includes(cell)) return with_path(game, path_step(path, cell, step_rule(puzzle)));
  const head = path[path.length - 1];
  const rule = step_rule(puzzle);
  const across = path_walk(path, grid_walk(puzzle.size, head, cell), rule);
  const down = path_walk(path, grid_walk(puzzle.size, head, cell, true), rule);
  return with_path(game, down.length > across.length ? down : across);
}

export function back(game: Game): Game {
  return game.path.length > 1 ? with_path(game, game.path.slice(0, -1)) : game;
}

const OFFSETS: Record<string, [number, number]> = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
};

export function arrow_target(game: Game, key: string): number | null {
  const offset = OFFSETS[key];
  if (!offset) return null;
  const { size } = game.puzzle;
  const head = game.path[game.path.length - 1];
  const row = Math.floor(head / size) + offset[0];
  const col = (head % size) + offset[1];
  return row < 0 || row >= size || col < 0 || col >= size ? null : row * size + col;
}

export function arrow_step(game: Game, key: string): Game {
  const to = arrow_target(game, key);
  if (to === null) return game;
  const { path } = game;
  if (path.length > 1 && to === path[path.length - 2]) return back(game);
  return with_path(game, path_step(path, to, step_rule(game.puzzle)));
}

/**
 * Legal steps from the head that don't leave a cell behind with too few ways in and out (two, or one for the last dot)
 * or cut the unvisited cells apart: the moves a careful player would still consider.
 */
export function viable_moves(puzzle: Puzzle, path: readonly number[]): number[] {
  const total = puzzle.size * puzzle.size;
  const end = dot_cells(puzzle)[last_dot(puzzle) - 1];
  const adj = open_neighbours(puzzle);
  const on = new Set(path);
  return adj[path[path.length - 1]].filter((to) => {
    if (on.has(to) || refusal(puzzle, path, to) !== null) return false;
    if (path.length + 1 === total) return true;
    for (let cell = 0; cell < total; cell++) {
      if (on.has(cell) || cell === to) continue;
      const ways = adj[cell].filter((next) => !on.has(next)).length;
      if (ways < (cell === end ? 1 : 2)) return false;
    }
    const seen = new Set([to]);
    const queue = [to];
    for (const cell of queue) {
      for (const next of adj[cell]) {
        if (!on.has(next) && !seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    return seen.size === total - path.length;
  });
}

export interface Hint {
  path: readonly number[];
  fix: boolean;
  cells: number[];
}

/**
 * A wrong step first: the path goes back to where it left the answer and takes the right step. Otherwise the next step
 * of the answer, then on through every cell that has only one way left, so the hint ends where a choice begins.
 */
export function hint(game: Game): Hint | null {
  const { puzzle, path } = game;
  const { solution } = puzzle;
  if (game.solved) return null;
  const wrong = path.findIndex((cell, index) => cell !== solution[index]);
  if (wrong >= 0) return { path: solution.slice(0, wrong + 1), fix: true, cells: [solution[wrong]] };
  const next = solution.slice(0, path.length + 1);
  while (next.length < solution.length && viable_moves(puzzle, next).length === 1) next.push(solution[next.length]);
  return { path: next, fix: false, cells: next.slice(path.length) };
}

export interface SizeRecord {
  solved: number;
  best: number | null;
}
export type Stats = Record<Size, SizeRecord>;

const record_schema = z.object({ solved: z.number().int().nonnegative(), best: z.number().nonnegative().nullable() });
export const stats_schema = z.object({ "6": record_schema, "7": record_schema, "8": record_schema });

export function empty_stats(): Stats {
  return { "6": { solved: 0, best: null }, "7": { solved: 0, best: null }, "8": { solved: 0, best: null } };
}

export function record(stats: Stats, size: Size, time: number, hints: number): Stats {
  const current = stats[size];
  const best = hints === 0 && (current.best === null || time < current.best) ? time : current.best;
  return { ...stats, [size]: { solved: current.solved + 1, best } };
}

export const saved_schema = z.object({
  size: size_schema,
  seed: z.number().int().nonnegative(),
  path: z.array(z.number().int().nonnegative()),
  hints: z.number().int().nonnegative(),
  elapsed: z.number().nonnegative(),
});
export type Saved = z.infer<typeof saved_schema>;

export function to_saved(game: Game, size: Size, elapsed: number): Saved {
  return { size, seed: game.puzzle.seed, path: [...game.path], hints: game.hints, elapsed };
}

export function restore(saved: Saved): Game {
  const game = new_game(saved.size, saved.seed);
  const [first, ...rest] = saved.path;
  if (first !== game.path[0]) return game;
  const rule = step_rule(game.puzzle);
  let path = game.path;
  for (const cell of rest) {
    const next = path_step(path, cell, rule);
    if (next.length !== path.length + 1) break;
    path = next;
  }
  return { ...with_path(game, path), hints: saved.hints };
}

export const DAILY_SIZE = Size.S7;

export function daily_game(day: string): Game {
  return new_game(DAILY_SIZE, daily_seed(day, "hop"));
}

export const daily_saved_schema = z.object({ day: z.string(), game: saved_schema });
