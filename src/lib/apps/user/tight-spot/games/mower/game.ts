import { z } from "zod";
import type { Vec } from "$kit/games/play2d/geometry";
import { collide, obstacles } from "../../core/obstacles";
import { SolidKind } from "../../core/scene";
import { hash } from "$kit/games/play2d/seed";
import { better, keep_best, levels_schema, unlocked as open_levels, with_stars, type LevelStars } from "../../core/track";
import { bodies, create_car, Gear, hitch_point, jackknifed, shift, step, type Car, type Input, type VehicleSpec } from "../../core/vehicle";
import { axis_of, BED_COST, CELL, coverage, create_grid, Cut, Ground, mark_cut, mow, overlap, Pattern, pattern_share, stripe, trample, type Grid, type Tally } from "./coverage";
import { deck_centre, swept } from "./deck";
import { BankKind, build_garden, type Bank, type Garden, type Grounds } from "./garden";
import { flood, flood_towed } from "./reach";
import { cutter, RigKind, RIGS, type Rig } from "./rig";
import { across_bank, BANK_TOLERANCE, slant } from "./slope";

export const Mode = { LAWNS: "lawns", LEVELS: "levels" } as const;
export type Mode = (typeof Mode)[keyof typeof Mode];
export const mode_schema = z.enum([Mode.LAWNS, Mode.LEVELS]);

export const Status = {
  READY: "ready",
  DRIVING: "driving",
  PAUSED: "paused",
  DONE: "done",
  /** So many flowers flattened that the finish line can't be reached any more. */
  FLATTENED: "flattened",
} as const;
export type Status = (typeof Status)[keyof typeof Status];

export const FINISH = 0.9;
export const OVERLAP_LIMIT = 0.25;
/** On a pattern level the second star asks for this share of the flat lawn laid the pattern's way. */
export const PATTERN_SHARE = 0.7;
/** A bump holds the mower where it was; pressing on is the same bump until it has backed off this far. */
export const BUMP_CLEAR = 0.3;
/** How long the contact rings flash after a bump, ms. */
export const BUMP_FLASH_MS = 1200;
/** What a bump adds to the round's time, ms. */
export const BUMP_COST_MS = 5000;

/** What a level past the first twelve brings: the tractor, a stripe pattern to lay, a bank. */
export interface Twist {
  rig?: RigKind;
  pattern?: Pattern;
  bank?: BankKind;
}

export interface Round {
  mode: Mode;
  seed: number;
  difficulty: number;
  level?: number;
  daily?: string;
  twist?: Twist;
}

export function rig_of(round: Pick<Round, "twist">): Rig {
  return RIGS[round.twist?.rig ?? RigKind.MOWER];
}

export function pattern_of(round: Pick<Round, "twist">): Pattern | null {
  return round.twist?.pattern ?? null;
}

function grounds_of(round: Round): Grounds | undefined {
  if (!round.twist) return undefined;
  return { field: round.twist.rig === RigKind.TRACTOR, bank: round.twist.bank };
}

export function garden_of(round: Round): Garden {
  return build_garden(round.seed, round.difficulty, grounds_of(round));
}

/** Not solids: a step that breaks a rule is held like a bump. */
export const Snag = { BANK: "bank", JACKKNIFE: "jackknife" } as const;
export type Snag = (typeof Snag)[keyof typeof Snag];

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
  /** Where the last bump touched. */
  contact: Vec | null;
  /** The bump the mower is still up against, until it has backed off `BUMP_CLEAR`. */
  bumped: Bump | null;
  /** Bumps this round, each `BUMP_COST_MS` on the clock. */
  bumps: number;
  /** The round's clock just after the last bump, for the flash. */
  bump_ms: number;
}

export interface Bump {
  kind: SolidKind | Snag;
  /** Where the mower stood when it bumped. */
  from: Vec;
}

export function create_game(round: Round): GameState {
  const garden = garden_of(round);
  return {
    round,
    garden,
    grid: create_grid(garden),
    car: create_car(garden.start, Gear.PARK, rig_of(round).spec),
    status: Status.READY,
    ms: 0,
    odometer: 0,
    tally: { coverable: 0, mown: 0, overlapped: 0, trampled: 0 },
    measured: false,
    contact: null,
    bumped: null,
    bumps: 0,
    bump_ms: 0,
  };
}

export interface Measured {
  coverable: Uint8Array;
  count: number;
  par_ms: number;
}

/** The slow part of a round: the coverable lawn from the lattice, and the par from it. */
export function measure_round(round: Round): Measured {
  const garden = garden_of(round);
  const grid = create_grid(garden);
  const rig = rig_of(round);
  const reach = rig.towed ? flood_towed(garden, grid, rig) : flood(garden, grid, rig.spec, rig.deck);
  return { coverable: grid.coverable, count: reach.coverable, par_ms: par_time(garden, reach.coverable, rig, pattern_of(round)) };
}

/** When the worker fails: the whole lawn counts as coverable, so the round can still be finished. */
export function measure_fallback(round: Round): Measured {
  const garden = garden_of(round);
  const grid = create_grid(garden);
  const coverable = new Uint8Array(grid.ground.length);
  let count = 0;
  for (let i = 0; i < grid.ground.length; i++) {
    if (grid.ground[i] !== Ground.LAWN) continue;
    coverable[i] = 1;
    count++;
  }
  return { coverable, count, par_ms: par_time(garden, count, rig_of(round), pattern_of(round)) };
}

/** Everything left mown at best, less the flowers: once that's under the finish line, the round is lost. */
export function out_of_reach(tally: Tally): boolean {
  return tally.coverable > 0 && tally.trampled > 0 && (tally.coverable - tally.trampled * BED_COST) / tally.coverable < FINISH;
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
  const tally = { ...state.tally, coverable: count, mown, overlapped };
  const lost = state.status === Status.DRIVING || state.status === Status.PAUSED ? out_of_reach(tally) : false;
  return { ...state, measured: true, tally, status: lost ? Status.FLATTENED : state.status, car: lost ? { ...state.car, speed: 0 } : state.car };
}

export function measure(state: GameState): GameState {
  return apply_mask(state, measure_round(state.round).coverable);
}

export function set_status(state: GameState, status: Status): GameState {
  return state.status === status ? state : { ...state, status };
}

export function advance(state: GameState, input: Input, dt: number, spec: VehicleSpec = rig_of(state.round).spec): GameState {
  if (state.status !== Status.DRIVING) return state;
  const rig = rig_of(state.round);
  const car = step(state.car, input, dt, spec);
  const ms = state.ms + dt * 1000;
  const hit = collide(car, obstacles(state.garden), spec);
  if (hit) return bump(state, ms, hit.solid.kind, hit.at);
  if (rig.towed && jackknifed(car, spec)) return bump(state, ms, Snag.JACKKNIFE, hitch_point(car, spec, 0));
  const tipping = across_bank(state.car, car, spec, state.garden);
  // The wheel still turns, or a mower held at the limit could never steer back toward the fall line.
  if (tipping) return bump({ ...state, car: { ...state.car, steer: car.steer } }, ms, Snag.BANK, tipping);
  const bumped = state.bumped && Math.hypot(car.x - state.bumped.from.x, car.y - state.bumped.from.y) <= BUMP_CLEAR ? state.bumped : null;
  const from = cutter(state.car, rig, spec);
  const to = cutter(car, rig, spec);
  const was = deck_centre(from, rig.deck);
  const now = deck_centre(to, rig.deck);
  const motion = { x: now.x - was.x, y: now.y - was.y };
  const moved = Math.hypot(motion.x, motion.y);
  if (moved < 1e-6 && to.heading === from.heading) return { ...state, car, ms, bumped };
  const odometer = state.odometer + moved;
  let tally = mow(state.grid, swept(from, to, rig.deck), motion, odometer, state.tally);
  mark_cut(state.grid.marks, from, to, rig.deck, stripe(motion), axis_of(motion));
  if (state.garden.beds.length > 0) tally = trample(state.grid, bodies(car, spec), tally);
  if (state.measured && tally.trampled > state.tally.trampled && out_of_reach(tally)) {
    return { ...state, car: { ...car, speed: 0 }, ms, odometer, tally, bumped, status: Status.FLATTENED };
  }
  // A pattern isn't done when the grass is: the player says when with Finish.
  const all = !pattern_of(state.round) && state.measured && tally.mown >= tally.coverable && tally.trampled === 0;
  return { ...state, car, ms, odometer, tally, bumped, status: all ? Status.DONE : state.status };
}

/**
 * Nothing solid ends a round: a hit is a bump. The step is undone (the mower stays where it was, stopped, in gear) and
 * the first bump against something costs `BUMP_COST_MS`; pressing on is the same bump.
 */
export function bump(state: GameState, ms: number, kind: SolidKind | Snag, at: Vec): GameState {
  const car = { ...state.car, speed: 0 };
  if (state.bumped) return { ...state, car, ms, contact: at };
  const cost = ms + BUMP_COST_MS;
  return { ...state, car, ms: cost, contact: at, bumped: { kind, from: { x: car.x, y: car.y } }, bumps: state.bumps + 1, bump_ms: cost };
}

/** The contact rings flash for a moment after a bump. */
export function bump_flash(state: Pick<GameState, "bumps" | "bump_ms" | "ms" | "contact">): boolean {
  return state.bumps > 0 && state.contact !== null && state.ms - state.bump_ms < BUMP_FLASH_MS;
}

export function change_gear(state: GameState, gear: Gear): GameState {
  if (state.status !== Status.DRIVING) return state;
  const car = shift(state.car, gear, rig_of(state.round).spec);
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
 * Par time from up-and-down passes over the coverable lawn: the mower's rows 1.2 m apart (a half-lock turn's shift, so
 * each pass laps the last by a hand's width) at a steady 2.6 m/s, a 4 s turn at the end of each row along the
 * garden's longer side, 8 s round every tree, island bed and pond, 6 s off the patio; then a quarter on top, up to the
 * next 5 s. The tractor's numbers are its own (`RIGS`). Stripes run their rows the asked way, a checkerboard mows it
 * all both ways, and a bank costs two turns to line up for it.
 */
export function par_time(garden: Garden, coverable: number, rig: Rig = RIGS.mower, pattern: Pattern | null = null): number {
  const area = coverable * CELL * CELL;
  const once = area / rig.pass;
  const run = pattern === Pattern.CHECKER ? once * 2 : once;
  const rows =
    pattern === Pattern.CHECKER
      ? once / garden.width + once / garden.height
      : pattern === Pattern.EAST_WEST
        ? once / garden.width
        : pattern === Pattern.NORTH_SOUTH
          ? once / garden.height
          : once / Math.max(garden.width, garden.height);
  const islands = garden.beds.filter((bed) => !touches_hedge(bed, garden)).length;
  const around = garden.trees.length + islands + (garden.pond ? 1 : 0);
  const axes = pattern === Pattern.EAST_WEST ? [0] : pattern === Pattern.NORTH_SOUTH ? [Math.PI / 2] : [];
  const turns = Math.max(0, rows - 1) + garden.banks.reduce((sum, bank) => sum + bank_turns(bank, axes, rig.pass), 0);
  const seconds = (run / rig.speed + turns * rig.turn + around * rig.around + rig.leave) * 1.25;
  return Math.ceil(seconds / 5) * 5000;
}

// Rows free to run down the fall line (no pattern, or a checkerboard, mown both ways anyway) pay two turns to line up;
// stripes across the fall line leave the bank to its own short passes down the slope, a turn each.
function bank_turns(bank: Bank, axes: readonly number[], pass: number): number {
  if (axes.every((axis) => slant(axis, bank.fall) <= BANK_TOLERANCE)) return 2;
  const across = { x: -Math.sin(bank.fall), y: Math.cos(bank.fall) };
  const spread = bank.shape.map((p) => p.x * across.x + p.y * across.y);
  return 2 + (Math.max(...spread) - Math.min(...spread)) / pass;
}

function touches_hedge(bed: readonly Vec[], garden: Garden): boolean {
  return bed.some((p) => p.x <= 1e-6 || p.y <= 1e-6 || p.x >= garden.width - 1e-6 || p.y >= garden.height - 1e-6);
}

export interface Par {
  ms: number;
}

/** The second star: the pattern laid on a pattern level, the overlap kept down anywhere else. */
export function tidy(state: Pick<GameState, "tally" | "grid" | "round">): boolean {
  const pattern = pattern_of(state.round);
  return pattern ? pattern_share(state.grid, pattern) >= PATTERN_SHARE : overlap(state.tally) <= OVERLAP_LIMIT;
}

export function stars(state: Pick<GameState, "status" | "tally" | "ms" | "grid" | "round">, par_ms: number | null): 0 | 1 | 2 | 3 {
  if (state.status !== Status.DONE) return 0;
  const neat = tidy(state) ? 1 : 0;
  const quick = par_ms !== null && state.ms <= par_ms ? 1 : 0;
  return (1 + neat + quick) as 1 | 2 | 3;
}

const PATTERN_NAMES: Record<Pattern, string> = {
  "east-west": "east–west",
  "north-south": "north–south",
  checker: "both ways",
};

export function pattern_name(pattern: Pattern): string {
  return PATTERN_NAMES[pattern];
}

const PATTERN_SHORT: Record<Pattern, string> = {
  "east-west": "E–W",
  "north-south": "N–S",
  checker: "both",
};

export function pattern_short(pattern: Pattern): string {
  return PATTERN_SHORT[pattern];
}

/** The start card's lines for what a level brings, the star it asks for first. */
export function twist_notes(round: Round): string[] {
  const notes: string[] = [];
  const pattern = pattern_of(round);
  const share = Math.round(PATTERN_SHARE * 100);
  if (pattern === Pattern.CHECKER) notes.push(`Checkerboard: mow it one way, then across. Star: ${share}% of the flat lawn cut both ways.`);
  else if (pattern) notes.push(`Stripes ${pattern_name(pattern)}. Star: ${share}% of the flat lawn last mown ${pattern_name(pattern)}.`);
  if (round.twist?.bank) notes.push(`Steep bank: cross it up or down the slope, within ${Math.round((BANK_TOLERANCE * 180) / Math.PI)}°.`);
  if (round.twist?.rig === RigKind.TRACTOR) notes.push("Tractor and 3 m gang mower: the reels behind cut. No turning on the spot, and backing round jackknifes it.");
  return notes;
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


export const saved_schema = z.object({
  best: z.record(z.string(), result_schema),
  levels: levels_schema,
});
export type Saved = z.infer<typeof saved_schema>;
export const EMPTY: Saved = { best: {}, levels: {} };

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
  const kept = keep_best(saved.best, round_key(round), result, better, (run, old) => ({
    ...run,
    coverage: Math.max(old?.coverage ?? 0, result.coverage),
    overlap: Math.min(old?.overlap ?? 100, result.overlap),
  }));
  const levels = round.level !== undefined ? with_stars(saved.levels, round.level, result.stars) : saved.levels;
  return { saved: { best: kept.bests, levels }, improved: kept.improved, first: kept.first };
}

// The first twelve only grow the garden; saves keep their stars by level number, so the ladder only ever appends.
const GROWING = 12;

interface Rung {
  name: string;
  difficulty: number;
  twist: Twist;
}

const LADDER: Rung[] = [
  { name: "Stripes east–west", difficulty: 0.35, twist: { pattern: Pattern.EAST_WEST } },
  { name: "The bank", difficulty: 0.4, twist: { bank: BankKind.STRAIGHT } },
  { name: "Checkerboard", difficulty: 0.15, twist: { pattern: Pattern.CHECKER } },
  { name: "Stripes by the bank", difficulty: 0.55, twist: { pattern: Pattern.NORTH_SOUTH, bank: BankKind.STRAIGHT } },
  { name: "The big field", difficulty: 0.3, twist: { rig: RigKind.TRACTOR } },
  { name: "Field with a bank", difficulty: 0.5, twist: { rig: RigKind.TRACTOR, bank: BankKind.STRAIGHT } },
  { name: "Slanted bank", difficulty: 0.75, twist: { pattern: Pattern.EAST_WEST, bank: BankKind.DIAGONAL } },
  { name: "Field in stripes", difficulty: 0.7, twist: { rig: RigKind.TRACTOR, pattern: Pattern.NORTH_SOUTH } },
  { name: "Checkerboard on the slope", difficulty: 0.6, twist: { pattern: Pattern.CHECKER, bank: BankKind.DIAGONAL } },
];

export const LEVEL_COUNT = GROWING + LADDER.length;

export function level_round(level: number): Round {
  const index = Math.max(0, Math.min(LEVEL_COUNT - 1, level - 1));
  const seed = hash(0x3077, index);
  if (index < GROWING) return { mode: Mode.LEVELS, level: index + 1, difficulty: index / (GROWING - 1), seed };
  const rung = LADDER[index - GROWING];
  return { mode: Mode.LEVELS, level: index + 1, difficulty: rung.difficulty, seed, twist: rung.twist };
}

export function level_name(round: Round): string | null {
  if (round.level === undefined || round.level <= GROWING) return null;
  return LADDER[round.level - GROWING - 1]?.name ?? null;
}

export function unlocked(levels: LevelStars): number {
  return open_levels(levels, LEVEL_COUNT);
}

export function lawn_round(seed: number): Round {
  return { mode: Mode.LAWNS, seed, difficulty: ((hash(seed, 5) % 1000) / 1000) * 0.8 + 0.1 };
}

export function daily_round(day: string, seed: number): Round {
  return { mode: Mode.LAWNS, seed, difficulty: ((hash(seed, 7) % 1000) / 1000) * 0.5 + 0.3, daily: day };
}

const HIT_NAMES: Partial<Record<SolidKind, string>> = {
  hedge: "the hedge",
  wall: "the shed",
  post: "a tree",
  water: "the pond",
};

/** What the mower is up against and how to get off it: "Bumped the shed: back off". */
export function bump_hint(state: Pick<GameState, "bumped" | "status">): string | null {
  const hit = state.bumped;
  if (!hit || state.status !== Status.DRIVING) return null;
  if (hit.kind === Snag.BANK) return "Too far across the bank: point up or down the slope";
  if (hit.kind === Snag.JACKKNIFE) return "The gang mower jackknifed: pull forward";
  return `Bumped ${HIT_NAMES[hit.kind] ?? "something"}: back off`;
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
