import { z } from "zod";
import { angle_between, type Polygon, type Vec } from "$kit/games/play2d/geometry";
import { collide, obstacles, type Scene } from "../../core/obstacles";
import { pass_portals } from "../../core/portals";
import { MAX_ANGLE } from "$kit/games/play2d/precision";
import { SolidKind, type Solid } from "../../core/scene";
import { hash } from "$kit/games/play2d/seed";
import { better, keep_best, levels_schema, unlocked as open_levels, with_stars, type LevelStars } from "../../core/track";
import {
  bodies,
  body_centre,
  create_car,
  Gear,
  headings,
  shift,
  step,
  Vehicle,
  VEHICLE_NAMES,
  VEHICLES,
  type Car,
  type Input,
  type Placement,
  type VehicleSpec,
} from "../../core/vehicle";
import {
  across,
  BALANCE_LIMIT,
  build_deck,
  HULL,
  lane_centre,
  moment,
  on_upper,
  solids_for,
  spawn_pose,
  type Cargo,
  type Deck,
  type Kit,
} from "./deck";

export { BALANCE_LIMIT };

export const Mode = { SAILINGS: "sailings", LEVELS: "levels" } as const;
export type Mode = (typeof Mode)[keyof typeof Mode];
export const mode_schema = z.enum([Mode.SAILINGS, Mode.LEVELS]);

export const Status = {
  READY: "ready",
  DRIVING: "driving",
  PAUSED: "paused",
  DONE: "done",
  CRASHED: "crashed",
} as const;
export type Status = (typeof Status)[keyof typeof Status];

export const MIN_GAP = 0.3;
export const MAX_GAP = 1;
export const CENTRED = 0.25;

export interface Round {
  mode: Mode;
  seed: number;
  difficulty: number;
  count: number;
  level?: number;
  daily?: string;
  kit?: Kit;
}

export interface Stowed {
  vehicle: Cargo;
  car: Placement;
  lane: number;
  gap: number;
  solids: Solid[];
}

export interface Hit {
  kind: SolidKind;
  what: string;
}

/** What undo puts back: the round as it stood when a vehicle came onto the quay. */
export interface Snapshot {
  car: Car;
  current: number;
  stowed: readonly Stowed[];
  scene: Scene;
}

export interface GameState {
  round: Round;
  deck: Deck;
  car: Car;
  current: number;
  stowed: readonly Stowed[];
  /** The deck's solids and every stowed vehicle's: one object per change, so the obstacle cache holds. */
  scene: Scene;
  history: readonly Snapshot[];
  status: Status;
  last_drive: Gear | null;
  ms: number;
  undos: number;
  contact: Vec | null;
  hit: Hit | null;
  /** Trips up or down the internal ramp: the camera cuts on each. */
  passes: number;
}

export function deck_for(round: Round): Deck {
  return build_deck(round.seed, round.difficulty, round.count, round.kit);
}

export function spec_of(state: Pick<GameState, "deck" | "current">): VehicleSpec {
  return VEHICLES[vehicle_of(state)];
}

export function vehicle_of(state: Pick<GameState, "deck" | "current">): Cargo {
  return state.deck.queue[Math.min(state.current, state.deck.queue.length - 1)];
}

function spawn(deck: Deck, current: number): Car {
  const vehicle = deck.queue[Math.min(current, deck.queue.length - 1)];
  return create_car(spawn_pose(deck, vehicle), Gear.PARK, VEHICLES[vehicle]);
}

export function scene_of(deck: Deck, stowed: readonly Stowed[], vehicle: Cargo): Scene {
  return { solids: [...solids_for(deck, vehicle), ...stowed.flatMap((each) => each.solids)] };
}

export function create_game(round: Round): GameState {
  const deck = deck_for(round);
  return {
    round,
    deck,
    car: spawn(deck, 0),
    current: 0,
    stowed: [],
    scene: scene_of(deck, [], deck.queue[0]),
    passes: 0,
    history: [],
    status: Status.READY,
    last_drive: null,
    ms: 0,
    undos: 0,
    contact: null,
    hit: null,
  };
}

export function set_status(state: GameState, status: Status): GameState {
  return state.status === status ? state : { ...state, status };
}

function xs(shapes: readonly Polygon[]): number[] {
  return shapes.flatMap((shape) => shape.map((p) => p.x));
}

export function stowed_solids(vehicle: Cargo, car: Placement, paint: number): Solid[] {
  const spec = VEHICLES[vehicle];
  const centre = body_centre(car, spec);
  return bodies(car, spec).map((shape) => ({
    kind: SolidKind.CAR,
    shape,
    car: { pose: { ...centre, heading: car.heading }, length: spec.length, width: spec.width, paint, vehicle },
  }));
}

export const Fault = {
  OFF_DECK: "off-deck",
  CROOKED: "crooked",
  ACROSS: "across",
  OFF_CENTRE: "off-centre",
  CLOSE: "close",
  FAR: "far",
} as const;
export type Fault = (typeof Fault)[keyof typeof Fault];

export interface Verdict {
  fault: Fault | null;
  lane: number;
  /** Body centre off the lane's middle: negative to port. */
  offset: number;
  gap: number;
  ahead: string;
  angle: number;
}

/**
 * Whether the vehicle could stay where it stands: on the deck, straight, inside one lane and centred in it, its nose
 * 0.3 to 1 m short of the vehicle ahead in that lane, or of the bow wall when it's the first.
 */
export function judge(deck: Deck, stowed: readonly Stowed[], car: Placement, spec: VehicleSpec): Verdict {
  const shapes = bodies(car, spec);
  const points = shapes.flat();
  const centre = body_centre(car, spec);
  const up = on_upper(deck, centre.y);
  const first = up ? deck.lanes : 0;
  const lane = first + Math.max(0, Math.min(deck.lanes - 1, Math.floor(across(deck, centre.y) / deck.lane_width)));
  const offset = centre.y - lane_centre(deck, lane);
  const angle = Math.max(...headings(car, spec).map((heading) => angle_between(heading, 0)));
  const front = Math.max(...xs(shapes));
  let ahead_x = deck.length;
  let ahead = "the bow";
  for (const each of stowed) {
    if (each.lane !== lane) continue;
    const rear = Math.min(...xs(each.solids.map((solid) => solid.shape)));
    if (rear > centre.x && rear < ahead_x) {
      ahead_x = rear;
      ahead = `the ${VEHICLE_NAMES[each.vehicle].toLowerCase()}`;
    }
  }
  const gap = ahead_x - front;
  const verdict = { lane, offset, gap, ahead, angle };
  const stern = up ? deck.upper!.start : 0;
  const shift = up ? deck.upper!.offset : 0;
  if (points.some((p) => p.x < stern || p.x > deck.length || p.y - shift < 0 || p.y - shift > deck.width)) return { ...verdict, fault: Fault.OFF_DECK };
  if (angle > MAX_ANGLE) return { ...verdict, fault: Fault.CROOKED };
  const y0 = shift + (lane - first) * deck.lane_width;
  const y1 = y0 + deck.lane_width;
  if (points.some((p) => p.y < y0 || p.y > y1)) return { ...verdict, fault: Fault.ACROSS };
  if (Math.abs(offset) > CENTRED) return { ...verdict, fault: Fault.OFF_CENTRE };
  if (gap < MIN_GAP) return { ...verdict, fault: Fault.CLOSE };
  if (gap > MAX_GAP) return { ...verdict, fault: Fault.FAR };
  return { ...verdict, fault: null };
}

export function verdict_of(state: GameState): Verdict {
  return judge(state.deck, state.stowed, state.car, spec_of(state));
}

export function fault_text(verdict: Verdict): string | null {
  switch (verdict.fault) {
    case null:
      return null;
    case Fault.OFF_DECK:
      return "Not on the deck yet";
    case Fault.CROOKED:
      return `Not straight: ${((verdict.angle * 180) / Math.PI).toFixed(1)}° off`;
    case Fault.ACROSS:
      return "Across two lanes";
    case Fault.OFF_CENTRE:
      return `Off centre: ${Math.round(Math.abs(verdict.offset) * 100)} cm to ${verdict.offset < 0 ? "port" : "starboard"}`;
    case Fault.CLOSE:
      return `Too close: ${Math.max(0, Math.round(verdict.gap * 100))} cm to ${verdict.ahead}`;
    case Fault.FAR:
      return `Pull up: ${verdict.gap.toFixed(1)} m to ${verdict.ahead}`;
  }
}

export function balance(deck: Deck, stowed: readonly Pick<Stowed, "vehicle" | "car">[]): number {
  return moment(
    stowed.map((each) => ({ vehicle: each.vehicle, y: across(deck, body_centre(each.car, VEHICLES[each.vehicle]).y) })),
    deck.width
  );
}

/** The balance with the vehicle in hand counted where it stands, once it's on the deck. */
export function balance_with(state: GameState): number {
  const spec = spec_of(state);
  const on_deck = state.status === Status.DRIVING && bodies(state.car, spec).every((shape) => shape.every((p) => p.x >= 0));
  return balance(state.deck, on_deck ? [...state.stowed, { vehicle: vehicle_of(state), car: state.car }] : state.stowed);
}

export function balanced(value: number): boolean {
  return Math.abs(value) <= BALANCE_LIMIT;
}

/** `spec` is the vehicle's, passed in so the Creep setting can swap in its variant without creep. */
export function advance(state: GameState, input: Input, dt: number, spec: VehicleSpec = spec_of(state)): GameState {
  if (state.status !== Status.DRIVING) return state;
  const moved = step(state.car, input, dt, spec);
  const car = pass_portals(moved, state.deck.portals);
  const passes = car === moved ? state.passes : state.passes + 1;
  const ms = state.ms + dt * 1000;
  const hit = collide(car, obstacles(state.scene), spec);
  if (!hit) return { ...state, car, ms, passes };
  const what = hit_name(state.deck, hit.solid);
  return { ...state, car: { ...car, speed: 0 }, ms, passes, status: Status.CRASHED, contact: hit.at, hit: { kind: hit.solid.kind, what } };
}

function hit_name(deck: Deck, solid: Solid): string {
  if (solid.kind === SolidKind.WATER) return "the water";
  if (solid.shape === deck.upper?.bar) return "the height bar";
  if (solid.kind === SolidKind.CAR) return solid.car?.vehicle ? `the ${VEHICLE_NAMES[solid.car.vehicle].toLowerCase()}` : "a vehicle";
  const x = Math.min(...solid.shape.map((p) => p.x));
  return x >= -HULL - 1e-6 ? "the ship's side" : "the quay fence";
}

/** Shifting into P where the vehicle may stay stows it: it joins the deck and the next one comes onto the quay. */
export function change_gear(state: GameState, gear: Gear): GameState {
  if (state.status !== Status.DRIVING) return state;
  const spec = spec_of(state);
  const car = shift(state.car, gear, spec);
  if (car === state.car) return state;
  const drives = gear === Gear.DRIVE || gear === Gear.REVERSE;
  const next: GameState = { ...state, car, last_drive: drives ? gear : state.last_drive };
  if (gear !== Gear.PARK || state.last_drive === null) return next;
  return stow(next);
}

export function stow(state: GameState): GameState {
  const verdict = verdict_of(state);
  if (verdict.fault) return state;
  const vehicle = vehicle_of(state);
  const { x, y, heading, steer, trailers } = state.car;
  const placed: Placement = trailers ? { x, y, heading, steer, trailers } : { x, y, heading, steer };
  const stowed = [...state.stowed, { vehicle, car: placed, lane: verdict.lane, gap: verdict.gap, solids: stowed_solids(vehicle, placed, state.current) }];
  const snapshot: Snapshot = { car: spawn(state.deck, state.current), current: state.current, stowed: state.stowed, scene: state.scene };
  const current = state.current + 1;
  const done = current >= state.deck.queue.length;
  return {
    ...state,
    stowed,
    scene: scene_of(state.deck, stowed, state.deck.queue[Math.min(current, state.deck.queue.length - 1)]),
    history: [...state.history, snapshot],
    current,
    car: done ? { ...state.car, gear: Gear.PARK, speed: 0 } : spawn(state.deck, current),
    last_drive: null,
    status: done ? Status.DONE : state.status,
  };
}

/** Takes the last stowed vehicle back to the quay, the round as it stood when it came on; the clock keeps running. */
export function undo(state: GameState): GameState {
  if (state.status !== Status.DRIVING || state.history.length === 0) return state;
  const snapshot = state.history[state.history.length - 1];
  return { ...state, ...snapshot, history: state.history.slice(0, -1), last_drive: null, undos: state.undos + 1 };
}

export interface Par {
  ms: number;
}

/** One for all aboard, one for the balance in its limit, one for the time at or under the planner's par. */
export function stars(state: Pick<GameState, "status" | "deck" | "stowed" | "ms">, par_ms: number | null): 0 | 1 | 2 | 3 {
  if (state.status !== Status.DONE) return 0;
  const level = balanced(balance(state.deck, state.stowed)) ? 1 : 0;
  const quick = par_ms !== null && state.ms <= par_ms ? 1 : 0;
  return (1 + level + quick) as 1 | 2 | 3;
}

export const result_schema = z.object({
  stars: z.number().int().min(1).max(3),
  ms: z.number().nonnegative(),
});
export type Result = z.infer<typeof result_schema>;
export const data_schema = z.object({
  bests: z.record(z.string(), result_schema),
  levels: levels_schema,
});
export type FerryData = z.infer<typeof data_schema>;
export const EMPTY_DATA: FerryData = { bests: {}, levels: {} };

export function round_key(round: Round): string {
  if (round.daily) return `daily:${round.daily}`;
  if (round.level !== undefined) return `level:${round.level}`;
  return `sailing:${round.count}`;
}

export interface Recorded {
  data: FerryData;
  improved: boolean;
  first: boolean;
}

export function record(data: FerryData, round: Round, result: Result): Recorded {
  const kept = keep_best(data.bests, round_key(round), result, better);
  const levels = round.level === undefined ? data.levels : with_stars(data.levels, round.level, result.stars);
  return { data: { bests: kept.bests, levels }, improved: kept.improved, first: kept.first };
}

export const MIN_COUNT = 3;
export const MAX_COUNT = 6;
const PER_COUNT = 3;
const FIRST_LEVELS = (MAX_COUNT - MIN_COUNT + 1) * PER_COUNT;

interface Rung {
  count: number;
  difficulty: number;
  kit: Kit;
  news?: string;
}

const { SEMI, CARAVAN } = Vehicle;

// Appended after the first twelve, which stay as they were, so stars saved by level number stay on their level.
const LADDER: readonly Rung[] = [
  { count: 3, difficulty: 0.25, kit: { must: [SEMI] }, news: "A truck and semi-trailer: 17 m and 18 t. Line it up long before the ramp." },
  { count: 4, difficulty: 0.35, kit: { must: [CARAVAN, CARAVAN] }, news: "Caravans: the trailer cuts inside the car on every turn." },
  { count: 5, difficulty: 0.5, kit: { must: [SEMI, CARAVAN] } },
  { count: 4, difficulty: 0.3, kit: { tide: 1 }, news: "High water: the linkspan sits at an angle to the quay. Come off it straight." },
  { count: 5, difficulty: 0.55, kit: { tide: -1, must: [CARAVAN] } },
  { count: 4, difficulty: 0.3, kit: { upper: 2 }, news: "An upper car deck, up the ramp on the starboard side. Cars and vans only: anything taller hits the height bar." },
  { count: 5, difficulty: 0.5, kit: { upper: 3, must: [SEMI] } },
  { count: 5, difficulty: 0.6, kit: { upper: 2, tide: 0.8, must: [CARAVAN] } },
  { count: 6, difficulty: 0.8, kit: { upper: 3, tide: -1, must: [SEMI] } },
];

export const LEVEL_COUNT = FIRST_LEVELS + LADDER.length;

export function level_round(level: number): Round {
  const index = Math.max(0, Math.min(LEVEL_COUNT - 1, level - 1));
  const seed = hash(0xfe22, index);
  const rung = LADDER[index - FIRST_LEVELS];
  if (rung) return { mode: Mode.LEVELS, level: index + 1, count: rung.count, difficulty: rung.difficulty, seed, kit: rung.kit };
  return {
    mode: Mode.LEVELS,
    level: index + 1,
    count: MIN_COUNT + Math.floor(index / PER_COUNT),
    difficulty: index / (FIRST_LEVELS - 1),
    seed,
  };
}

export function level_news(round: Round): string | null {
  return round.level === undefined ? null : (LADDER[round.level - 1 - FIRST_LEVELS]?.news ?? null);
}

export function unlocked(levels: LevelStars): number {
  return open_levels(levels, LEVEL_COUNT);
}

export function sailing_round(seed: number): Round {
  return {
    mode: Mode.SAILINGS,
    seed,
    count: MIN_COUNT + (hash(seed, 3) % (MAX_COUNT - MIN_COUNT + 1)),
    difficulty: ((hash(seed, 5) % 1000) / 1000) * 0.7 + 0.15,
  };
}

export const DAILY_COUNT = 5;

export function daily_round(day: string, seed: number): Round {
  return { mode: Mode.SAILINGS, seed, count: DAILY_COUNT, difficulty: ((hash(seed, 7) % 1000) / 1000) * 0.5 + 0.3, daily: day };
}

export function crash_title(hit: Hit | null): string {
  return hit ? `Touched ${hit.what}` : "Touched something";
}

export function round_title(round: Round): string {
  const vehicles = `${round.count} vehicles`;
  if (round.daily) return `Daily sailing · ${vehicles}`;
  if (round.level !== undefined) return `Level ${round.level} · ${vehicles}`;
  return `Sailing · ${vehicles}`;
}

export function vehicle_name(vehicle: Cargo): string {
  return VEHICLE_NAMES[vehicle];
}

export function queue_line(state: GameState): string | null {
  const { queue } = state.deck;
  if (state.current >= queue.length) return null;
  const next = queue[state.current + 1];
  const own = `${vehicle_name(queue[state.current])} ${state.current + 1}/${queue.length}`;
  return next ? `${own} · next: ${vehicle_name(next)}` : `${own} · last one`;
}

export function balance_text(value: number): string {
  const percent = Math.round(Math.abs(value) * 100);
  if (percent === 0) return "Level";
  return `${percent}% ${value < 0 ? "port" : "starboard"}`;
}

export function is_bus(vehicle: Cargo): boolean {
  return vehicle === Vehicle.BUS;
}
