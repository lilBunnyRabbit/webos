import type { Direction } from "$kit/games/direction";
import { daily_seed } from "$kit/games/time";
import { z } from "zod";
import { CHAR_DIRECTIONS, generate, MOVE_CHARS, offset, Tile, type GenerateOptions, type Level } from "./puzzle";

export const Difficulty = { EASY: "easy", MEDIUM: "medium", HARD: "hard" } as const;
export type Difficulty = (typeof Difficulty)[keyof typeof Difficulty];
export const DIFFICULTIES: readonly Difficulty[] = Object.values(Difficulty);
export const difficulty_schema = z.enum(Difficulty);

export const PRESETS: Record<Difficulty, GenerateOptions> = {
  easy: { side: 7, boxes: 2, floor: 0.5, min_pushes: 7, pulls: 30 },
  medium: { side: 9, boxes: 3, floor: 0.5, min_pushes: 11, pulls: 50 },
  hard: { side: 11, boxes: 4, floor: 0.48, min_pushes: 15, pulls: 80 },
};

export interface Game {
  difficulty: Difficulty;
  seed: number;
  level: Level;
  player: number;
  /** Indexed by box, so each one keeps its identity while it moves. */
  boxes: readonly number[];
  log: string;
  future: string;
}

export function new_game(difficulty: Difficulty, seed: number): Game {
  const level = generate(PRESETS[difficulty], seed);
  return { difficulty, seed, level, player: level.player, boxes: level.boxes, log: "", future: "" };
}

export function is_solved(game: Pick<Game, "level" | "boxes">): boolean {
  return game.boxes.every((box) => game.level.goals.includes(box));
}

export function move_count(game: Game): number {
  return game.log.length;
}

export function push_count(game: Game): number {
  return game.log.replace(/[a-z]/g, "").length;
}

function apply(game: Game, direction: Direction): Game | null {
  const { width, tiles } = game.level;
  const step = offset(width, direction);
  const next = game.player + step;
  if (tiles[next] !== Tile.FLOOR) return null;
  const box = game.boxes.indexOf(next);
  if (box === -1) return { ...game, player: next, log: game.log + MOVE_CHARS[direction] };
  const beyond = next + step;
  if (tiles[beyond] !== Tile.FLOOR || game.boxes.includes(beyond)) return null;
  const boxes = game.boxes.slice();
  boxes[box] = beyond;
  return { ...game, player: next, boxes, log: game.log + MOVE_CHARS[direction].toUpperCase() };
}

export function move(game: Game, direction: Direction): Game {
  if (is_solved(game)) return game;
  const next = apply(game, direction);
  return next ? { ...next, future: "" } : game;
}

export function undo(game: Game): Game {
  const last = game.log.at(-1);
  if (last === undefined) return game;
  const step = offset(game.level.width, CHAR_DIRECTIONS[last.toLowerCase()]);
  const player = game.player - step;
  const pushed = last !== last.toLowerCase() ? game.boxes.indexOf(game.player + step) : -1;
  const boxes = pushed === -1 ? game.boxes : game.boxes.map((box, i) => (i === pushed ? game.player : box));
  return { ...game, player, boxes, log: game.log.slice(0, -1), future: last + game.future };
}

export function redo(game: Game): Game {
  const next_char = game.future[0];
  if (next_char === undefined) return game;
  const next = apply(game, CHAR_DIRECTIONS[next_char.toLowerCase()]);
  return next ? { ...next, future: game.future.slice(1) } : { ...game, future: "" };
}

/** Back to the start with every move kept as redo, so a restart can be walked back. */
export function restart(game: Game): Game {
  return {
    ...game,
    player: game.level.player,
    boxes: game.level.boxes,
    log: "",
    future: game.log + game.future,
  };
}

export function replay(game: Game, log: string): Game | null {
  let current: Game = { ...game, player: game.level.player, boxes: game.level.boxes, log: "", future: "" };
  for (const char of log) {
    const direction = CHAR_DIRECTIONS[char.toLowerCase()];
    if (!direction) return null;
    const next = apply(current, direction);
    if (!next || next.log.at(-1) !== char) return null;
    current = next;
  }
  return current;
}

export interface Best {
  moves: number;
  pushes: number;
}

export function better(a: Best, b: Best | undefined): boolean {
  return !b || a.moves < b.moves || (a.moves === b.moves && a.pushes < b.pushes);
}

export const best_schema = z.object({ moves: z.number().int().nonnegative(), pushes: z.number().int().nonnegative() });
export const bests_schema = z.record(z.string(), best_schema);
export type Bests = z.infer<typeof bests_schema>;

const MAX_BESTS = 500;

export function level_key(difficulty: Difficulty, seed: number): string {
  return `${difficulty}:${seed}`;
}

/** Oldest levels drop out past the cap, so the record can't grow without end. */
export function record_best(bests: Bests, key: string, best: Best): Bests {
  if (!better(best, bests[key])) return bests;
  const { [key]: _, ...rest } = bests;
  const entries = Object.entries(rest);
  return Object.fromEntries([...entries.slice(Math.max(0, entries.length - MAX_BESTS + 1)), [key, best]]);
}

export interface DifficultyRecord {
  solved: number;
  best: number | null;
}
export type Stats = Record<Difficulty, DifficultyRecord>;

const record_schema = z.object({ solved: z.number().int().nonnegative(), best: z.number().nonnegative().nullable() });
export const stats_schema = z.object({ easy: record_schema, medium: record_schema, hard: record_schema });

export function empty_stats(): Stats {
  return { easy: { solved: 0, best: null }, medium: { solved: 0, best: null }, hard: { solved: 0, best: null } };
}

export function record(stats: Stats, difficulty: Difficulty, time: number): Stats {
  const current = stats[difficulty];
  const best = current.best === null || time < current.best ? time : current.best;
  return { ...stats, [difficulty]: { solved: current.solved + 1, best } };
}

/** The level is its seed, so a save is only the moves on top of it. */
export const saved_schema = z.object({
  difficulty: difficulty_schema,
  seed: z.number().int().nonnegative(),
  log: z.string().regex(/^[lurdLURD]*$/),
  future: z.string().regex(/^[lurdLURD]*$/),
  elapsed: z.number().nonnegative(),
});
export type Saved = z.infer<typeof saved_schema>;

export function restore(saved: Saved): Game | null {
  const game = replay(new_game(saved.difficulty, saved.seed), saved.log);
  return game ? { ...game, future: saved.future } : null;
}

export const daily_saved_schema = z.object({ day: z.string(), game: saved_schema });

export const DAILY_DIFFICULTY = Difficulty.MEDIUM;

export function daily_game(day: string): Game {
  return new_game(DAILY_DIFFICULTY, daily_seed(day, "sokoban"));
}
