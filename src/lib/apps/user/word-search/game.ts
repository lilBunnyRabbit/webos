import { daily_seed } from "$kit/games/time";
import { z } from "zod";
import { Difficulty, generate, placement_cells, reverse, type Placement, type Puzzle } from "./puzzle";

export { Difficulty };
export const DIFFICULTIES: readonly Difficulty[] = Object.values(Difficulty);
export const difficulty_schema = z.enum(Difficulty);

export interface Game {
  puzzle: Puzzle;
  /** Words in the order they were found, which also picks each one's highlight colour. */
  found: readonly string[];
  hints: number;
  solved: boolean;
}

export function new_game(difficulty: Difficulty, seed: number): Game {
  return { puzzle: generate(difficulty, seed), found: [], hints: 0, solved: false };
}

export function line_between(size: number, from: number, to: number): number[] | null {
  const [r0, c0] = [Math.floor(from / size), from % size];
  const [r1, c1] = [Math.floor(to / size), to % size];
  const rows = r1 - r0;
  const cols = c1 - c0;
  if (rows !== 0 && cols !== 0 && Math.abs(rows) !== Math.abs(cols)) return null;
  const steps = Math.max(Math.abs(rows), Math.abs(cols));
  const [dr, dc] = [Math.sign(rows), Math.sign(cols)];
  return Array.from({ length: steps + 1 }, (_, i) => (r0 + dr * i) * size + c0 + dc * i);
}

/**
 * Where a drag ends: the pointer's offset from the start cell's centre (in cells) snapped to the nearest of the
 * eight directions, projected onto it and clamped to the grid, so a wobbly finger still draws a straight line.
 */
export function snap_end(size: number, from: number, dx: number, dy: number): number {
  if (Math.hypot(dx, dy) < 0.5) return from;
  const octant = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
  const angle = (octant * Math.PI) / 4;
  const dc = Math.round(Math.cos(angle));
  const dr = Math.round(Math.sin(angle));
  let steps = Math.max(0, Math.round((dx * dc + dy * dr) / (dc && dr ? 2 : 1)));
  const [row, col] = [Math.floor(from / size), from % size];
  const limit = (pos: number, d: number) => (d > 0 ? size - 1 - pos : d < 0 ? pos : Infinity);
  steps = Math.min(steps, limit(row, dr), limit(col, dc));
  return (row + dr * steps) * size + col + dc * steps;
}

/** The listed word a selection spells, either way round; generated puzzles hold each word exactly once. */
export function match(puzzle: Puzzle, cells: readonly number[]): Placement | null {
  if (cells.length < 2) return null;
  const text = cells.map((cell) => puzzle.letters[cell]).join("");
  return puzzle.placements.find((placement) => placement.word === text || placement.word === reverse(text)) ?? null;
}

export function with_found(game: Game, word: string): Game {
  if (game.found.includes(word)) return game;
  const found = [...game.found, word];
  return { ...game, found, solved: found.length === game.puzzle.placements.length };
}

/** The first letter of a word still hidden: enough to start looking, not the whole answer. */
export function hint(game: Game, roll: number = Math.random()): number | null {
  const open = game.puzzle.placements.filter((placement) => !game.found.includes(placement.word));
  if (!open.length) return null;
  const placement = open[Math.floor(roll * open.length) % open.length];
  return placement_cells(game.puzzle.size, placement)[0];
}

export interface Capsule {
  word: string;
  colour: number;
  row: number;
  col: number;
  end_row: number;
  end_col: number;
}

export const CAPSULE_COLOURS = 6;

export function capsules(game: Game): Capsule[] {
  return game.found.flatMap((word, index) => {
    const placement = game.puzzle.placements.find((each) => each.word === word);
    if (!placement) return [];
    const last = placement.word.length - 1;
    return [
      {
        word,
        colour: index % CAPSULE_COLOURS,
        row: placement.row,
        col: placement.col,
        end_row: placement.row + placement.dr * last,
        end_col: placement.col + placement.dc * last,
      },
    ];
  });
}

export interface LevelRecord {
  solved: number;
  /** Fastest solve without hints, in milliseconds. */
  best: number | null;
}
export type Stats = Record<Difficulty, LevelRecord>;

const record_schema = z.object({ solved: z.number().int().nonnegative(), best: z.number().nonnegative().nullable() });
export const stats_schema = z.object({ easy: record_schema, medium: record_schema, hard: record_schema });

export function empty_stats(): Stats {
  return { easy: { solved: 0, best: null }, medium: { solved: 0, best: null }, hard: { solved: 0, best: null } };
}

export function record(stats: Stats, difficulty: Difficulty, time: number, hints: number): Stats {
  const current = stats[difficulty];
  const best = hints === 0 && (current.best === null || time < current.best) ? time : current.best;
  return { ...stats, [difficulty]: { solved: current.solved + 1, best } };
}

/** The puzzle itself is its seed, so a save is only the words found on top of it. */
export const saved_schema = z.object({
  difficulty: difficulty_schema,
  seed: z.number().int().nonnegative(),
  found: z.array(z.string()),
  hints: z.number().int().nonnegative(),
  elapsed: z.number().nonnegative(),
});
export type Saved = z.infer<typeof saved_schema>;

export function restore(saved: Saved): Game | null {
  const game = new_game(saved.difficulty, saved.seed);
  const words = new Set(game.puzzle.placements.map((placement) => placement.word));
  if (!saved.found.every((word) => words.has(word))) return null;
  return { ...saved.found.reduce(with_found, game), hints: saved.hints };
}

export const DAILY_DIFFICULTY = Difficulty.MEDIUM;

export function daily_game(day: string): Game {
  return new_game(DAILY_DIFFICULTY, daily_seed(day, "word-search"));
}

/** A daily puzzle in progress, kept apart from the regular save. */
export const daily_saved_schema = z.object({ day: z.string(), game: saved_schema });
