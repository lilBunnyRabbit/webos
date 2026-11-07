import { z } from "zod";
import { hash } from "$kit/games/play2d/seed";
import { better, keep_best, keep_precision, levels_schema, unlocked as open_levels, type LevelStars, type Recorded as TrackRecorded } from "../../core/track";
import type { Order } from "./freight";

export const Mode = { JOBS: "jobs", LEVELS: "levels" } as const;
export type Mode = (typeof Mode)[keyof typeof Mode];
export const mode_schema = z.enum([Mode.JOBS, Mode.LEVELS]);

export const SIZES = [1, 2, 3, 4] as const;
export const size_schema = z.number().int().min(1).max(4);

export interface Round {
  mode: Mode;
  seed: number;
  difficulty: number;
  order: Order;
  level?: number;
  daily?: string;
}

export function round_size(round: Pick<Round, "order">): number {
  return round.order.semis + round.order.dollies + round.order.doubles;
}

interface Rung {
  order: Order;
  difficulty: number;
  /** What the level brings in, for its start card. */
  brings?: string;
}

const rung = (semis: number, dollies: number, doubles: number, difficulty: number, brings?: string): Rung => ({
  order: { semis, dollies, doubles },
  difficulty,
  brings,
});

const LADDER: readonly Rung[] = [
  rung(1, 0, 0, 0, "Back under the kingpin, tow it across, back it in."),
  rung(1, 0, 0, 0.15),
  rung(2, 0, 0, 0.2, "Two trailers, one after the other."),
  rung(2, 0, 0, 0.4, "Tighter rows: less room each side."),
  rung(0, 1, 0, 0.3, "A converter dolly: it can't be backed, so pull it through."),
  rung(3, 0, 0, 0.45),
  rung(2, 1, 0, 0.5),
  rung(0, 0, 1, 0.4, "A double: two trailers and a dolly, 25 m behind you."),
  rung(3, 0, 0, 0.7, "The tightest rows yet."),
  rung(2, 0, 1, 0.6),
  rung(4, 0, 0, 0.8, "A full yard: four trailers."),
  rung(2, 1, 1, 0.9),
];

export const LEVEL_COUNT = LADDER.length;

export function level_round(level: number): Round {
  const index = Math.max(0, Math.min(LEVEL_COUNT - 1, level - 1));
  const { order, difficulty } = LADDER[index];
  return { mode: Mode.LEVELS, level: index + 1, order, difficulty, seed: hash(0x5a07, index) };
}

export function level_brings(level: number): string | undefined {
  return LADDER[level - 1]?.brings;
}

function random_order(size: number, seed: number, salt: number): Order {
  let dollies = 0;
  let doubles = 0;
  // One move in four or so pulls through, never more than one of each.
  if (hash(seed, salt) % 4 === 0) dollies = 1;
  if (hash(seed, salt + 1) % 5 === 0 && size - dollies > 0) doubles = 1;
  return { semis: Math.max(0, size - dollies - doubles), dollies: Math.min(dollies, size), doubles };
}

export function job_round(size: number, seed: number): Round {
  return { mode: Mode.JOBS, seed, order: random_order(size, seed, 3), difficulty: ((hash(seed, 5) % 1000) / 1000) * 0.7 + 0.15 };
}

export const DAILY_SIZE = 3;

export function daily_round(day: string, seed: number): Round {
  return { mode: Mode.JOBS, seed, order: random_order(DAILY_SIZE, seed, 9), difficulty: ((hash(seed, 7) % 1000) / 1000) * 0.5 + 0.3, daily: day };
}

export const result_schema = z.object({
  stars: z.number().int().min(1).max(3),
  ms: z.number().nonnegative(),
  precision: z.number().min(0).max(100).optional(),
});
export type Result = z.infer<typeof result_schema>;
export const bests_schema = z.record(z.string(), result_schema);
export type Bests = z.infer<typeof bests_schema>;

export function round_key(round: Round): string {
  if (round.daily) return `daily:${round.daily}`;
  if (round.level !== undefined) return `level:${round.level}`;
  return `jobs:${round_size(round)}`;
}

export type Recorded = TrackRecorded<Result>;

export function record_best(bests: Bests, round: Round, result: Result): Recorded {
  return keep_best(bests, round_key(round), result, better, keep_precision);
}

export const data_schema = z.object({ bests: bests_schema, levels: levels_schema });
export type ShunterData = z.infer<typeof data_schema>;
export const EMPTY_DATA: ShunterData = { bests: {}, levels: {} };

export function unlocked(levels: LevelStars): number {
  return open_levels(levels, LEVEL_COUNT);
}
