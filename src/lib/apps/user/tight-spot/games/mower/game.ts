import { z } from "zod";
import type { Vec } from "../../core/geometry";
import { collide, obstacles } from "../../core/obstacles";
import { SolidKind } from "../../core/scene";
import { hash } from "../../core/seed";
import { bodies, create_car, Gear, MOWER, shift, step, Vehicle, type Car, type Input, type VehicleSpec } from "../../core/vehicle";
import { CELL, coverage, create_grid, Cut, Ground, mow, overlap, trample, type Grid, type Tally } from "./coverage";
import { deck_centre, deck_of, swept } from "./deck";
import { build_garden, type Garden } from "./garden";
import { flood } from "./reach";

export const Mode = { LAWNS: "lawns", LEVELS: "levels" } as const;
export type Mode = (typeof Mode)[keyof typeof Mode];
export const mode_schema = z.enum([Mode.LAWNS, Mode.LEVELS]);

export const Status = {
  READY: "ready",
  DRIVING: "driving",
  PAUSED: "paused",
  DONE: "done",
  CRASHED: "crashed",
} as const;
export type Status = (typeof Status)[keyof typeof Status];

export const SPEC: VehicleSpec = MOWER;
export const VEHICLE = Vehicle.MOWER;
export const DECK = deck_of(VEHICLE);

export const FINISH = 0.9;
export const OVERLAP_LIMIT = 0.25;

export interface Round {
  mode: Mode;
  seed: number;
  difficulty: number;
  level?: number;
  daily?: string;
}

export interface GameState {
  round: Round;
  garden: Garden;
  grid: Grid;
  car: Car;
  status: Status;
  ms: number;
  /** Metres the deck has travelled, which tells a second pass from the same one. */
  odometer: number;
  tally: Tally;
  /** False until the coverable lawn is known (`measure`, or a worker's mask through `apply_mask`). */
  measured: boolean;
  contact: Vec | null;
  hit: SolidKind | null;
}

export function create_game(round: Round): GameState {
  const garden = build_garden(round.seed, round.difficulty);
  return {
    round,
    garden,
    grid: create_grid(garden),
    car: create_car(garden.start, Gear.PARK, SPEC),
    status: Status.READY,
    ms: 0,
    odometer: 0,
    tally: { coverable: 0, mown: 0, overlapped: 0, trampled: 0 },
    measured: false,
    contact: null,
    hit: null,
  };
}

export interface Measured {
  coverable: Uint8Array;
  count: number;
  par_ms: number;
}

/** The slow part of a round: the coverable lawn from the lattice, and the par from it. */
export function measure_round(round: Round): Measured {
  const garden = build_garden(round.seed, round.difficulty);
  const grid = create_grid(garden);
  const reach = flood(garden, grid, SPEC, DECK);
  return { coverable: grid.coverable, count: reach.coverable, par_ms: par_time(garden, reach.coverable) };
}

/** Takes the coverable lawn in and counts what's been mown of it so far: the round may have started without it. */
export function apply_mask(state: GameState, coverable: Uint8Array): GameState {
  const { grid } = state;
  grid.coverable.set(coverable);
  let count = 0;
  let mown = 0;
  let overlapped = 0;
  for (let i = 0; i < grid.coverable.length; i++) {
    if (!grid.coverable[i]) continue;
    count++;
    if (grid.cut[i] !== Cut.LONG) mown++;
    if (grid.overlapped[i]) overlapped++;
  }
  return { ...state, measured: true, tally: { ...state.tally, coverable: count, mown, overlapped } };
}

export function measure(state: GameState): GameState {
  return apply_mask(state, measure_round(state.round).coverable);
}

export function set_status(state: GameState, status: Status): GameState {
  return state.status === status ? state : { ...state, status };
}

export function advance(state: GameState, input: Input, dt: number, spec: VehicleSpec = SPEC): GameState {
  if (state.status !== Status.DRIVING) return state;
  const car = step(state.car, input, dt, spec);
  const ms = state.ms + dt * 1000;
  const hit = collide(car, obstacles(state.garden), spec);
  if (hit) return { ...state, car: { ...car, speed: 0 }, ms, status: Status.CRASHED, contact: hit.at, hit: hit.solid.kind };
  const was = deck_centre(state.car, DECK);
  const now = deck_centre(car, DECK);
  const motion = { x: now.x - was.x, y: now.y - was.y };
  const moved = Math.hypot(motion.x, motion.y);
  if (moved < 1e-6 && car.heading === state.car.heading) return { ...state, car, ms };
  const odometer = state.odometer + moved;
  let tally = mow(state.grid, swept(state.car, car, DECK), motion, odometer, state.tally);
  if (state.garden.beds.length > 0) tally = trample(state.grid, bodies(car, spec), tally);
  const all = state.measured && tally.mown >= tally.coverable && tally.trampled === 0;
  return { ...state, car, ms, odometer, tally, status: all ? Status.DONE : state.status };
}

export function change_gear(state: GameState, gear: Gear): GameState {
  if (state.status !== Status.DRIVING) return state;
  const car = shift(state.car, gear, SPEC);
  return car === state.car ? state : { ...state, car };
}

export function can_finish(state: GameState): boolean {
  return state.status === Status.DRIVING && state.measured && coverage(state.tally) >= FINISH;
}

export function finish(state: GameState): GameState {
  if (!can_finish(state)) return state;
  return { ...state, car: { ...state.car, speed: 0 }, status: Status.DONE };
}

/**
 * Par time from up-and-down passes over the coverable lawn: rows 1.2 m apart (a half-lock turn's shift, so each pass
 * laps the last by a hand's width) at a steady 2.6 m/s, a 4 s turn at the end of each row along the garden's longer
 * side, 8 s round every tree, island bed and pond, 6 s off the patio; then a quarter on top, up to the next 5 s.
 */
export function par_time(garden: Garden, coverable: number): number {
  const area = coverable * CELL * CELL;
  const run = area / 1.2;
  const rows = run / Math.max(garden.width, garden.height);
  const islands = garden.beds.filter((bed) => !touches_hedge(bed, garden)).length;
  const around = garden.trees.length + islands + (garden.pond ? 1 : 0);
  const seconds = (run / 2.6 + Math.max(0, rows - 1) * 4 + around * 8 + 6) * 1.25;
  return Math.ceil(seconds / 5) * 5000;
}

function touches_hedge(bed: readonly Vec[], garden: Garden): boolean {
  return bed.some((p) => p.x <= 1e-6 || p.y <= 1e-6 || p.x >= garden.width - 1e-6 || p.y >= garden.height - 1e-6);
}

export interface Par {
  ms: number;
}

export function stars(state: Pick<GameState, "status" | "tally" | "ms">, par_ms: number | null): 0 | 1 | 2 | 3 {
  if (state.status !== Status.DONE) return 0;
  const tidy = overlap(state.tally) <= OVERLAP_LIMIT ? 1 : 0;
  const quick = par_ms !== null && state.ms <= par_ms ? 1 : 0;
  return (1 + tidy + quick) as 1 | 2 | 3;
}

export function percent(share: number): number {
  return Math.floor(share * 1000) / 10;
}

export const result_schema = z.object({
  stars: z.number().int().min(1).max(3),
  ms: z.number().nonnegative(),
  coverage: z.number().min(0).max(100),
  overlap: z.number().min(0).max(100),
});
export type Result = z.infer<typeof result_schema>;

export const levels_schema = z.record(z.string(), z.number().int().min(1).max(3));
export type LevelStars = z.infer<typeof levels_schema>;

export const saved_schema = z.object({
  best: z.record(z.string(), result_schema),
  levels: levels_schema,
});
export type Saved = z.infer<typeof saved_schema>;
export const EMPTY: Saved = { best: {}, levels: {} };

export function better(a: Result | undefined, b: Result): boolean {
  if (!a) return true;
  return b.stars !== a.stars ? b.stars > a.stars : b.ms < a.ms;
}

export function round_key(round: Round): string {
  if (round.daily) return `daily:${round.daily}`;
  if (round.level !== undefined) return `level:${round.level}`;
  return "lawns";
}

export interface Recorded {
  saved: Saved;
  improved: boolean;
  first: boolean;
}

/** Stars, then time; the best coverage and least overlap are kept whichever run set them. */
export function record(saved: Saved, round: Round, result: Result): Recorded {
  const key = round_key(round);
  const old = saved.best[key];
  const improved = better(old, result);
  const run = improved ? result : old!;
  const best = {
    ...run,
    coverage: Math.max(old?.coverage ?? 0, result.coverage),
    overlap: Math.min(old?.overlap ?? 100, result.overlap),
  };
  const levels =
    round.level !== undefined ? { ...saved.levels, [round.level]: Math.max(saved.levels[round.level] ?? 0, result.stars) } : saved.levels;
  return { saved: { best: { ...saved.best, [key]: best }, levels }, improved, first: old === undefined };
}

export const LEVEL_COUNT = 12;

export function level_round(level: number): Round {
  const index = Math.max(0, Math.min(LEVEL_COUNT - 1, level - 1));
  return { mode: Mode.LEVELS, level: index + 1, difficulty: index / (LEVEL_COUNT - 1), seed: hash(0x3077, index) };
}

export function unlocked(levels: LevelStars): number {
  let highest = 1;
  for (const key of Object.keys(levels)) {
    const level = Number(key);
    if (Number.isInteger(level) && level >= 1) highest = Math.max(highest, level + 1);
  }
  return Math.min(LEVEL_COUNT, highest);
}

export function lawn_round(seed: number): Round {
  return { mode: Mode.LAWNS, seed, difficulty: ((hash(seed, 5) % 1000) / 1000) * 0.8 + 0.1 };
}

export function daily_round(day: string, seed: number): Round {
  return { mode: Mode.LAWNS, seed, difficulty: ((hash(seed, 7) % 1000) / 1000) * 0.5 + 0.3, daily: day };
}

const HIT_NAMES: Partial<Record<SolidKind, string>> = {
  hedge: "Into the hedge",
  wall: "Hit the shed",
  post: "Hit a tree",
  water: "Into the pond",
};

export function crash_title(hit: SolidKind | null): string {
  return (hit && HIT_NAMES[hit]) ?? "Hit something";
}

export function round_title(round: Round): string {
  if (round.daily) return "Daily lawn";
  if (round.level !== undefined) return `Level ${round.level}`;
  return "Lawn";
}

export function lawn_area(state: GameState): number {
  let lawn = 0;
  for (let i = 0; i < state.grid.ground.length; i++) if (state.grid.ground[i] === Ground.LAWN) lawn++;
  return lawn * CELL * CELL;
}

export function nearest_uncut(state: GameState, from: Vec): Vec | null {
  const { grid } = state;
  let best = Infinity;
  let found: Vec | null = null;
  for (let i = 0; i < grid.coverable.length; i++) {
    if (!grid.coverable[i] || grid.cut[i] !== Cut.LONG) continue;
    const col = i % grid.cols;
    const x = (col + 0.5) * CELL;
    const y = ((i - col) / grid.cols + 0.5) * CELL;
    const d = (x - from.x) ** 2 + (y - from.y) ** 2;
    if (d < best) {
      best = d;
      found = { x, y };
    }
  }
  return found;
}

export { coverage, overlap };
