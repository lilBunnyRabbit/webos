import { daily_seed } from "$lib/core/games/time";
import { create_rng } from "$lib/core/utils/random";
import { z } from "zod";

export const Difficulty = {
  BEGINNER: "beginner",
  INTERMEDIATE: "intermediate",
  EXPERT: "expert",
  CUSTOM: "custom",
} as const;
export type Difficulty = (typeof Difficulty)[keyof typeof Difficulty];

export const DIFFICULTIES: readonly Difficulty[] = Object.values(Difficulty);

export type Preset = Exclude<Difficulty, "custom">;

export const Cell = { HIDDEN: "hidden", REVEALED: "revealed", FLAGGED: "flagged" } as const;
export type Cell = (typeof Cell)[keyof typeof Cell];

export const Status = { READY: "ready", PLAYING: "playing", WON: "won", LOST: "lost" } as const;
export type Status = (typeof Status)[keyof typeof Status];

export interface Config {
  width: number;
  height: number;
  mines: number;
}

export interface Game {
  config: Config;
  mines: readonly boolean[];
  counts: readonly number[];
  cells: readonly Cell[];
  status: Status;
  exploded: number | null;
}

export const PRESETS: Record<Preset, Config> = {
  beginner: { width: 9, height: 9, mines: 10 },
  intermediate: { width: 16, height: 16, mines: 40 },
  expert: { width: 30, height: 16, mines: 99 },
};

export const LIMITS = {
  width: { min: 5, max: 40 },
  height: { min: 5, max: 30 },
  mines: { min: 1 },
} as const;

export const config_schema = z.object({
  width: z.number().int(),
  height: z.number().int(),
  mines: z.number().int(),
});

export const difficulty_schema = z.enum(Difficulty);

export interface GameRecord {
  played: number;
  won: number;
  /** Fastest win in milliseconds. Custom boards differ in size, so they don't keep one. */
  best: number | null;
}

export type Stats = Record<Difficulty, GameRecord>;

const record_schema = z.object({
  played: z.number().int().nonnegative(),
  won: z.number().int().nonnegative(),
  best: z.number().nonnegative().nullable(),
});

export const stats_schema = z.object({
  beginner: record_schema,
  intermediate: record_schema,
  expert: record_schema,
  custom: record_schema,
});

export function empty_stats(): Stats {
  return {
    beginner: { played: 0, won: 0, best: null },
    intermediate: { played: 0, won: 0, best: null },
    expert: { played: 0, won: 0, best: null },
    custom: { played: 0, won: 0, best: null },
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.round(value) || min, min), max);
}

export function max_mines(width: number, height: number): number {
  return width * height - 9;
}

export function clamp_config(config: Config): Config {
  const width = clamp(config.width, LIMITS.width.min, LIMITS.width.max);
  const height = clamp(config.height, LIMITS.height.min, LIMITS.height.max);
  const mines = clamp(config.mines, LIMITS.mines.min, max_mines(width, height));
  return { width, height, mines };
}

export function config_of(difficulty: Difficulty, custom: Config): Config {
  return difficulty === Difficulty.CUSTOM ? clamp_config(custom) : PRESETS[difficulty];
}

export function new_game(config: Config): Game {
  const size = config.width * config.height;
  return {
    config,
    mines: [],
    counts: [],
    cells: Array<Cell>(size).fill(Cell.HIDDEN),
    status: Status.READY,
    exploded: null,
  };
}

export function neighbours(config: Config, index: number): number[] {
  const row = Math.floor(index / config.width);
  const col = index % config.width;
  const result: number[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const r = row + dr;
      const c = col + dc;
      if (r >= 0 && r < config.height && c >= 0 && c < config.width) result.push(r * config.width + c);
    }
  }
  return result;
}

/** Mines anywhere but the first click and its neighbours; only the click itself when the board is too full for that. */
export function place_mines(config: Config, safe: number, random: () => number = Math.random): boolean[] {
  const size = config.width * config.height;
  const area = new Set([safe, ...neighbours(config, safe)]);
  const excluded = size - area.size >= config.mines ? area : new Set([safe]);
  const candidates: number[] = [];
  for (let i = 0; i < size; i++) if (!excluded.has(i)) candidates.push(i);

  const count = Math.min(config.mines, candidates.length);
  const mines = Array<boolean>(size).fill(false);
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(random() * (candidates.length - i));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    mines[candidates[i]] = true;
  }
  return mines;
}

export function count_mines(config: Config, mines: readonly boolean[]): number[] {
  return mines.map((_, i) => neighbours(config, i).filter((n) => mines[n]).length);
}

export function with_mines(config: Config, mines: readonly boolean[]): Game {
  return { ...new_game(config), mines, counts: count_mines(config, mines), status: Status.PLAYING };
}

function is_won(game: Game): boolean {
  return game.cells.every((cell, i) => game.mines[i] || cell === Cell.REVEALED);
}

function open(game: Game, start: readonly number[]): Game {
  const cells = game.cells.slice();
  let exploded: number | null = null;
  const queue = [...start];

  while (queue.length) {
    const index = queue.pop()!;
    if (cells[index] !== Cell.HIDDEN) continue;
    cells[index] = Cell.REVEALED;
    if (game.mines[index]) {
      exploded ??= index;
      continue;
    }
    if (game.counts[index] === 0) {
      for (const n of neighbours(game.config, index)) if (cells[n] === Cell.HIDDEN) queue.push(n);
    }
  }

  const next: Game = { ...game, cells };
  if (exploded !== null) return { ...next, status: Status.LOST, exploded };
  if (is_won(next)) {
    // A cleared board flags the rest of the mines, as the counter reaching zero should show.
    return { ...next, status: Status.WON, cells: cells.map((cell, i) => (game.mines[i] ? Cell.FLAGGED : cell)) };
  }
  return next;
}

const finished = (game: Game) => game.status === Status.WON || game.status === Status.LOST;

/** The first reveal places the mines, so it is never a mine. */
export function reveal(game: Game, index: number, random: () => number = Math.random): Game {
  if (finished(game) || game.cells[index] !== Cell.HIDDEN) return game;
  if (game.status === Status.READY) {
    const mines = place_mines(game.config, index, random);
    game = { ...game, mines, counts: count_mines(game.config, mines), status: Status.PLAYING };
  }
  return open(game, [index]);
}

export function chord(game: Game, index: number): Game {
  if (game.status !== Status.PLAYING || game.cells[index] !== Cell.REVEALED) return game;
  const around = neighbours(game.config, index);
  const flags = around.filter((n) => game.cells[n] === Cell.FLAGGED).length;
  if (game.counts[index] === 0 || flags !== game.counts[index]) return game;
  const hidden = around.filter((n) => game.cells[n] === Cell.HIDDEN);
  return hidden.length ? open(game, hidden) : game;
}

export function toggle_flag(game: Game, index: number): Game {
  if (finished(game)) return game;
  const cell = game.cells[index];
  if (cell === Cell.REVEALED) return game;
  const cells = game.cells.slice();
  cells[index] = cell === Cell.FLAGGED ? Cell.HIDDEN : Cell.FLAGGED;
  return { ...game, cells };
}

export function activate(game: Game, index: number, random: () => number = Math.random): Game {
  return game.cells[index] === Cell.REVEALED ? chord(game, index) : reveal(game, index, random);
}

export function flag_count(game: Game): number {
  return game.cells.filter((cell) => cell === Cell.FLAGGED).length;
}

/** Mines minus flags; goes negative when the player over-flags, as the classic counter does. */
export function mines_left(game: Game): number {
  return game.config.mines - flag_count(game);
}

export function record(stats: Stats, difficulty: Difficulty, won: boolean, time_ms: number): Stats {
  const current = stats[difficulty];
  const best =
    won && difficulty !== Difficulty.CUSTOM && (current.best === null || time_ms < current.best)
      ? time_ms
      : current.best;
  return {
    ...stats,
    [difficulty]: { played: current.played + 1, won: current.won + (won ? 1 : 0), best },
  };
}

export function step(config: Config, index: number, key: string): number {
  const row = Math.floor(index / config.width);
  const col = index % config.width;
  switch (key) {
    case "ArrowUp":
      return Math.max(row - 1, 0) * config.width + col;
    case "ArrowDown":
      return Math.min(row + 1, config.height - 1) * config.width + col;
    case "ArrowLeft":
      return row * config.width + Math.max(col - 1, 0);
    case "ArrowRight":
      return row * config.width + Math.min(col + 1, config.width - 1);
    case "Home":
      return row * config.width;
    case "End":
      return row * config.width + config.width - 1;
    default:
      return index;
  }
}

export const DAILY_DIFFICULTY = Difficulty.INTERMEDIATE;

/** Mines placed at the first click would depend on where it lands, so the daily board starts with its middle open. */
export function daily_game(day: string): Game {
  const config = PRESETS[DAILY_DIFFICULTY];
  const start = Math.floor(config.height / 2) * config.width + Math.floor(config.width / 2);
  const mines = place_mines(config, start, create_rng(daily_seed(day, "minesweeper")));
  return reveal(with_mines(config, mines), start);
}
