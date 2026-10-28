import { z } from "zod";
import { inside_convex, overlaps, contact_point } from "./collision";
import { angle_between, bounds_of, bounds_overlap, type Bounds, type Pose, type Vec } from "./geometry";
import { corners, create_car, Gear, HATCHBACK, shift, step, type Car, type Input, type VehicleSpec } from "./vehicle";
import { hash, open_world, Scenario, SCENARIOS, scenario_world, type Bay, type Solid, type SolidKind, type World } from "./world";

export const Mode = { SCENARIO: "scenario", LEVELS: "levels", OPEN: "open" } as const;
export type Mode = (typeof Mode)[keyof typeof Mode];
export const MODES: readonly Mode[] = Object.values(Mode);

export const Status = { READY: "ready", DRIVING: "driving", PAUSED: "paused", PARKED: "parked", CRASHED: "crashed" } as const;
export type Status = (typeof Status)[keyof typeof Status];

export const ANY = "any";
export type ScenarioPick = Scenario | typeof ANY;

export const MAX_ANGLE = (5 * Math.PI) / 180;

export const SCENARIO_INFO: Record<Scenario, { name: string; brief: string; par: number }> = {
  parallel: { name: "Parallel", brief: "Slot in between the two cars along the kerb.", par: 2 },
  forward: { name: "Nose in", brief: "Drive forward into the marked bay.", par: 0 },
  reverse: { name: "Reverse in", brief: "Back into the marked bay, nose out.", par: 1 },
  angled: { name: "Angled", brief: "Turn into the slanted bay, nose first.", par: 0 },
  garage: { name: "Garage", brief: "Drive in and stop close to the back wall. Listen to the sensors.", par: 0 },
  pillars: { name: "Pillars", brief: "Squeeze past the pillar into the bay, either way round.", par: 1 },
  narrow: { name: "Narrow aisle", brief: "Cars on both sides and little room to swing.", par: 2 },
  door: { name: "Garage door", brief: "Turn off a narrow alley through a tight door.", par: 2 },
  "dead-end": { name: "Dead end", brief: "Turn round in the street and stop in the box facing out.", par: 2 },
};

export const OPEN_INFO = { name: "Open lot", brief: "Drive around and park in any free bay.", par: 1 };

export interface Round {
  mode: Mode;
  scenario: Scenario | null;
  difficulty: number;
  seed: number;
  level?: number;
  daily?: string;
}

export interface GameState {
  round: Round;
  world: World;
  car: Car;
  status: Status;
  /** Changes between D and R, the way a driving examiner counts. */
  moves: number;
  last_drive: Gear | null;
  ms: number;
  contact: Vec | null;
  hit: Solid | null;
  bay: Bay | null;
}

export function world_for(round: Round): World {
  if (round.mode === Mode.OPEN || round.scenario === null) return open_world(round.seed);
  return scenario_world(round.seed, round.scenario, round.difficulty);
}

export function create_game(round: Round): GameState {
  const world = world_for(round);
  return {
    round,
    world,
    car: create_car(world.start),
    status: Status.READY,
    moves: 0,
    last_drive: null,
    ms: 0,
    contact: null,
    hit: null,
    bay: null,
  };
}

export function set_status(state: GameState, status: Status): GameState {
  return state.status === status ? state : { ...state, status };
}

export interface Hit {
  solid: Solid;
  at: Vec;
}

export interface Obstacles {
  solids: Solid[];
  bounds: Bounds[];
}

const obstacle_cache = new WeakMap<World, Obstacles>();

export function obstacles(world: World): Obstacles {
  let cached = obstacle_cache.get(world);
  if (!cached) {
    cached = { solids: world.solids, bounds: world.solids.map((solid) => bounds_of(solid.shape)) };
    obstacle_cache.set(world, cached);
  }
  return cached;
}

export function collide(pose: Pose, near: Obstacles, spec: VehicleSpec = HATCHBACK): Hit | null {
  const body = corners(pose, spec);
  const box = bounds_of(body);
  for (let i = 0; i < near.solids.length; i++) {
    if (!bounds_overlap(box, near.bounds[i])) continue;
    const solid = near.solids[i];
    if (!overlaps(body, solid.shape)) continue;
    return { solid, at: contact_point(body, solid.shape) ?? { x: pose.x, y: pose.y } };
  }
  return null;
}

export function parked_in(pose: Pose, bay: Bay, spec: VehicleSpec = HATCHBACK): boolean {
  if (!corners(pose, spec).every((corner) => inside_convex(corner, bay.shape))) return false;
  const off = angle_between(pose.heading, bay.heading);
  return off <= MAX_ANGLE || (bay.either && Math.PI - off <= MAX_ANGLE);
}

export function bay_for(pose: Pose, world: World, spec: VehicleSpec = HATCHBACK): Bay | null {
  return world.bays.find((bay) => parked_in(pose, bay, spec)) ?? null;
}

export function verdict(state: GameState): "inside" | "crooked" | "backwards" | "outside" {
  const body = corners(state.car);
  for (const bay of state.world.bays) {
    if (!body.every((corner) => inside_convex(corner, bay.shape))) continue;
    if (parked_in(state.car, bay)) return "inside";
    return Math.PI - angle_between(state.car.heading, bay.heading) <= MAX_ANGLE ? "backwards" : "crooked";
  }
  return "outside";
}

export function advance(state: GameState, input: Input, dt: number, spec: VehicleSpec = HATCHBACK): GameState {
  if (state.status !== Status.DRIVING) return state;
  const car = step(state.car, input, dt, spec);
  const hit = collide(car, obstacles(state.world));
  const ms = state.ms + dt * 1000;
  if (hit) return { ...state, car: { ...car, speed: 0 }, ms, status: Status.CRASHED, contact: hit.at, hit: hit.solid };
  return { ...state, car, ms };
}

export function change_gear(state: GameState, gear: Gear): GameState {
  if (state.status !== Status.DRIVING) return state;
  const car = shift(state.car, gear);
  if (car === state.car) return state;
  const drives = gear === Gear.DRIVE || gear === Gear.REVERSE;
  const moves = drives && state.last_drive !== null && state.last_drive !== gear ? state.moves + 1 : state.moves;
  const next: GameState = { ...state, car, moves, last_drive: drives ? gear : state.last_drive };
  if (gear !== Gear.PARK) return next;
  const bay = bay_for(car, state.world);
  return bay ? { ...next, status: Status.PARKED, bay } : next;
}

export function par(round: Round): number {
  return round.scenario === null ? OPEN_INFO.par : SCENARIO_INFO[round.scenario].par;
}

export function stars(round: Round, moves: number): 1 | 2 | 3 {
  const target = par(round);
  return moves <= target ? 3 : moves <= target + 2 ? 2 : 1;
}

export interface Result {
  moves: number;
  ms: number;
}

export function better(a: Result | undefined, b: Result): boolean {
  if (!a) return true;
  return b.moves !== a.moves ? b.moves < a.moves : b.ms < a.ms;
}

export function round_key(round: Round): string {
  return round.scenario ?? Mode.OPEN;
}

export const result_schema = z.object({ moves: z.number().int().nonnegative(), ms: z.number().nonnegative() });
export const bests_schema = z.record(z.string(), result_schema);
export type Bests = z.infer<typeof bests_schema>;
export const levels_schema = z.record(z.string(), z.number().int().min(1).max(3));
export type LevelStars = z.infer<typeof levels_schema>;

const LEVEL_ORDER: readonly Scenario[] = [
  Scenario.GARAGE,
  Scenario.FORWARD,
  Scenario.ANGLED,
  Scenario.REVERSE,
  Scenario.PILLARS,
  Scenario.PARALLEL,
  Scenario.DEAD_END,
  Scenario.NARROW,
  Scenario.DOOR,
];
export const LEVEL_COUNT = LEVEL_ORDER.length * 3;

/** Level 1 is roomy; each lap of the nine scenarios is tighter and busier than the last. */
export function level_round(level: number): Round {
  const index = Math.max(0, Math.min(LEVEL_COUNT - 1, level - 1));
  return {
    mode: Mode.LEVELS,
    scenario: LEVEL_ORDER[index % LEVEL_ORDER.length],
    difficulty: index / (LEVEL_COUNT - 1),
    seed: hash(0x7195, index),
    level: index + 1,
  };
}

export function unlocked(levels: LevelStars): number {
  let highest = 1;
  for (const key of Object.keys(levels)) {
    const level = Number(key);
    if (Number.isInteger(level) && level >= 1) highest = Math.max(highest, level + 1);
  }
  return Math.min(LEVEL_COUNT, highest);
}

export function scenario_round(pick: ScenarioPick, seed: number, daily?: string): Round {
  const scenario = pick === ANY ? SCENARIOS[hash(seed, 3) % SCENARIOS.length] : pick;
  const difficulty = ((hash(seed, 5) % 1000) / 1000) * 0.7 + 0.15;
  return { mode: Mode.SCENARIO, scenario, difficulty, seed, ...(daily ? { daily } : {}) };
}

export function open_round(seed: number): Round {
  return { mode: Mode.OPEN, scenario: null, difficulty: 0.3, seed };
}

export const pick_schema = z.enum([ANY, ...SCENARIOS] as [ScenarioPick, ...ScenarioPick[]]);
export const mode_schema = z.enum(MODES as [Mode, ...Mode[]]);

export const WheelMode = { CENTRES: "centres", STAYS: "stays" } as const;
export type WheelMode = (typeof WheelMode)[keyof typeof WheelMode];
export const wheel_schema = z.enum([WheelMode.CENTRES, WheelMode.STAYS]);

export const SteeringMode = { WHEEL: "wheel", BUTTONS: "buttons" } as const;
export type SteeringMode = (typeof SteeringMode)[keyof typeof SteeringMode];
export const steering_schema = z.enum([SteeringMode.WHEEL, SteeringMode.BUTTONS]);

export const HIT_NAMES: Record<SolidKind, string> = {
  car: "a parked car",
  wall: "a wall",
  pillar: "a pillar",
  kerb: "the kerb",
  shelf: "a shelf",
};

export function round_title(round: Round): string {
  const name = round.scenario === null ? OPEN_INFO.name : SCENARIO_INFO[round.scenario].name;
  if (round.daily) return `Daily · ${name}`;
  if (round.level) return `Level ${round.level} · ${name}`;
  return name;
}

export function round_brief(round: Round): string {
  return round.scenario === null ? OPEN_INFO.brief : SCENARIO_INFO[round.scenario].brief;
}
