import { z } from "zod";
import { inside_convex, overlaps, contact_point } from "./collision";
import { angle_between, bounds_of, bounds_overlap, type Bounds, type Vec } from "./geometry";
import {
  bodies,
  create_car,
  Gear,
  hitch_point,
  jackknifed,
  shift,
  step,
  Vehicle,
  VEHICLES,
  type Car,
  type Input,
  type Placement,
  type VehicleSpec,
} from "./vehicle";
import {
  hash,
  open_world,
  Scenario,
  SCENARIOS,
  scenario_world,
  type Bay,
  type Solid,
  type SolidKind,
  type World,
} from "./world";

export const Mode = { SCENARIO: "scenario", LEVELS: "levels", OPEN: "open" } as const;
export type Mode = (typeof Mode)[keyof typeof Mode];
export const MODES: readonly Mode[] = Object.values(Mode);

export const Status = {
  READY: "ready",
  DRIVING: "driving",
  PAUSED: "paused",
  PARKED: "parked",
  CRASHED: "crashed",
} as const;
export type Status = (typeof Status)[keyof typeof Status];

export const ANY = "any";
export type ScenarioPick = Scenario | typeof ANY;

export const MAX_ANGLE = (5 * Math.PI) / 180;

const CARS: readonly Vehicle[] = [Vehicle.HATCH, Vehicle.VAN, Vehicle.PICKUP];

interface ScenarioInfo {
  name: string;
  brief: string;
  par: number;
  /** The round's seed picks one; the lot sizes its bays and gaps to it. */
  vehicles: readonly Vehicle[];
}

export const SCENARIO_INFO: Record<Scenario, ScenarioInfo> = {
  parallel: { name: "Parallel", brief: "Slot in between the two cars along the kerb.", par: 2, vehicles: CARS },
  forward: { name: "Nose in", brief: "Drive forward into the marked bay.", par: 0, vehicles: CARS },
  reverse: { name: "Reverse in", brief: "Back into the marked bay, nose out.", par: 1, vehicles: CARS },
  angled: { name: "Angled", brief: "Turn into the slanted bay, nose first.", par: 0, vehicles: CARS },
  garage: {
    name: "Garage",
    brief: "Drive in and stop close to the back wall. Listen to the sensors.",
    par: 0,
    vehicles: CARS,
  },
  pillars: {
    name: "Pillars",
    brief: "Squeeze past the pillar into the bay, either way round.",
    par: 1,
    vehicles: CARS,
  },
  narrow: { name: "Narrow aisle", brief: "Cars on both sides and little room to swing.", par: 2, vehicles: CARS },
  door: { name: "Garage door", brief: "Turn off a narrow alley through a tight door.", par: 2, vehicles: CARS },
  "dead-end": {
    name: "Dead end",
    brief: "Turn round in the street and stop in the box facing out.",
    par: 2,
    vehicles: CARS,
  },
  "end-bay": {
    name: "End bay",
    brief: "The last free bay is in the corner at the end of a full aisle. No room to swing: take it in turns.",
    par: 2,
    vehicles: CARS,
  },
  "bus-stop": {
    name: "Bus stop",
    brief: "Pull into the lay-by between the parked cars. The tail swings out as you straighten.",
    par: 1,
    vehicles: [Vehicle.BUS],
  },
  depot: {
    name: "Depot",
    brief: "Back the bus into its lane between the others, nose out.",
    par: 1,
    vehicles: [Vehicle.BUS],
  },
  driveway: {
    name: "Driveway",
    brief: "Back the trailer off the street through the gate. Steer the other way to swing it.",
    par: 2,
    vehicles: [Vehicle.TOWING],
  },
  slipway: {
    name: "Slipway",
    brief: "Back the trailer down the ramp to the water, between the posts.",
    par: 2,
    vehicles: [Vehicle.TOWING],
  },
};

export const VEHICLE_NAMES: Record<Vehicle, string> = {
  hatch: "Hatchback",
  van: "Van",
  pickup: "Pickup",
  bus: "City bus",
  towing: "Car and trailer",
};

export const OPEN_INFO = { name: "Open lot", brief: "Drive around and park in any free bay.", par: 1 };

export interface Round {
  mode: Mode;
  scenario: Scenario | null;
  difficulty: number;
  seed: number;
  vehicle: Vehicle;
  level?: number;
  daily?: string;
}

export const JACKKNIFE = "jackknife";
export type HitKind = SolidKind | typeof JACKKNIFE;

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
  hit: { kind: HitKind } | null;
  bay: Bay | null;
}

export function spec_of(round: Round): VehicleSpec {
  return VEHICLES[round.vehicle];
}

export function vehicle_for(scenario: Scenario | null, seed: number): Vehicle {
  if (scenario === null) return Vehicle.HATCH;
  const choices = SCENARIO_INFO[scenario].vehicles;
  return choices[hash(seed, 13) % choices.length];
}

export function world_for(round: Round): World {
  if (round.mode === Mode.OPEN || round.scenario === null) return open_world(round.seed);
  return scenario_world(round.seed, round.scenario, round.difficulty, spec_of(round));
}

export function create_game(round: Round): GameState {
  const world = world_for(round);
  return {
    round,
    world,
    car: create_car(world.start, Gear.PARK, spec_of(round)),
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

export function collide(car: Placement, near: Obstacles, spec: VehicleSpec = VEHICLES.hatch): Hit | null {
  for (const body of bodies(car, spec)) {
    const box = bounds_of(body);
    for (let i = 0; i < near.solids.length; i++) {
      if (!bounds_overlap(box, near.bounds[i])) continue;
      const solid = near.solids[i];
      if (!overlaps(body, solid.shape)) continue;
      return { solid, at: contact_point(body, solid.shape) ?? { x: car.x, y: car.y } };
    }
  }
  return null;
}

function lined_up(heading: number, bay: Bay): boolean {
  const off = angle_between(heading, bay.heading);
  return off <= MAX_ANGLE || (bay.either && Math.PI - off <= MAX_ANGLE);
}

function inside(car: Placement, bay: Bay, spec: VehicleSpec): boolean {
  return bodies(car, spec).every((body) => body.every((corner) => inside_convex(corner, bay.shape)));
}

/** A trailer must be lined up with the bay too, not only the car in front of it. */
export function parked_in(car: Placement, bay: Bay, spec: VehicleSpec = VEHICLES.hatch): boolean {
  if (!inside(car, bay, spec)) return false;
  return lined_up(car.heading, bay) && (!car.trailer || lined_up(car.trailer.heading, bay));
}

export function bay_for(car: Placement, world: World, spec: VehicleSpec = VEHICLES.hatch): Bay | null {
  return world.bays.find((bay) => parked_in(car, bay, spec)) ?? null;
}

export function verdict(state: GameState): "inside" | "crooked" | "backwards" | "outside" {
  const spec = spec_of(state.round);
  for (const bay of state.world.bays) {
    if (!inside(state.car, bay, spec)) continue;
    if (parked_in(state.car, bay, spec)) return "inside";
    return Math.PI - angle_between(state.car.heading, bay.heading) <= MAX_ANGLE ? "backwards" : "crooked";
  }
  return "outside";
}

/** `spec` is the round's vehicle, passed in so the Creep setting can swap in its variant without creep. */
export function advance(
  state: GameState,
  input: Input,
  dt: number,
  spec: VehicleSpec = spec_of(state.round)
): GameState {
  if (state.status !== Status.DRIVING) return state;
  const car = step(state.car, input, dt, spec);
  const ms = state.ms + dt * 1000;
  if (spec.trailer && jackknifed(car)) {
    return {
      ...state,
      car: { ...car, speed: 0 },
      ms,
      status: Status.CRASHED,
      contact: hitch_point(car, spec.trailer),
      hit: { kind: JACKKNIFE },
    };
  }
  const hit = collide(car, obstacles(state.world), spec);
  if (hit)
    return {
      ...state,
      car: { ...car, speed: 0 },
      ms,
      status: Status.CRASHED,
      contact: hit.at,
      hit: { kind: hit.solid.kind },
    };
  return { ...state, car, ms };
}

export function change_gear(state: GameState, gear: Gear): GameState {
  if (state.status !== Status.DRIVING) return state;
  const spec = spec_of(state.round);
  const car = shift(state.car, gear, spec);
  if (car === state.car) return state;
  const drives = gear === Gear.DRIVE || gear === Gear.REVERSE;
  const moves = drives && state.last_drive !== null && state.last_drive !== gear ? state.moves + 1 : state.moves;
  const next: GameState = { ...state, car, moves, last_drive: drives ? gear : state.last_drive };
  if (gear !== Gear.PARK) return next;
  const bay = bay_for(car, state.world, spec);
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

const LAP: readonly Scenario[] = [
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
const BIG_LAP: readonly Scenario[] = [
  Scenario.BUS_STOP,
  Scenario.END_BAY,
  Scenario.DRIVEWAY,
  Scenario.DEPOT,
  Scenario.SLIPWAY,
];
const LAPS = 3;
const PER_LAP = LAP.length + BIG_LAP.length;
const CAR_LEVELS = LAP.length * LAPS;
export const LEVEL_COUNT = PER_LAP * LAPS;

/**
 * Three laps, each tighter and busier than the last: the nine original car spots, then the newer ones. A car spot
 * keeps the difficulty and seed it had when the ladder was 27 car levels long.
 */
export function level_round(level: number): Round {
  const index = Math.max(0, Math.min(LEVEL_COUNT - 1, level - 1));
  const lap = Math.floor(index / PER_LAP);
  const at = index % PER_LAP;
  const base = { mode: Mode.LEVELS, level: index + 1 };
  if (at < LAP.length) {
    const old = lap * LAP.length + at;
    const scenario = LAP[at];
    const seed = hash(0x7195, old);
    return { ...base, scenario, difficulty: old / (CAR_LEVELS - 1), seed, vehicle: vehicle_for(scenario, seed) };
  }
  const k = at - LAP.length;
  const scenario = BIG_LAP[k];
  const seed = hash(0x7195, 100 + lap * BIG_LAP.length + k);
  const difficulty = Math.min(1, (lap * LAP.length + 1.5 + k * 1.75) / (CAR_LEVELS - 1));
  return { ...base, scenario, difficulty, seed, vehicle: vehicle_for(scenario, seed) };
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
  return {
    mode: Mode.SCENARIO,
    scenario,
    difficulty,
    seed,
    vehicle: vehicle_for(scenario, seed),
    ...(daily ? { daily } : {}),
  };
}

export function open_round(seed: number): Round {
  return { mode: Mode.OPEN, scenario: null, difficulty: 0.3, seed, vehicle: Vehicle.HATCH };
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
  post: "a post",
  kerb: "the kerb",
  shelf: "a shelf",
  water: "the water",
};

export function crash_title(hit: GameState["hit"]): string {
  if (!hit) return "Touched something";
  if (hit.kind === JACKKNIFE) return "Jackknifed the trailer";
  return `Touched ${HIT_NAMES[hit.kind]}`;
}

export function round_title(round: Round): string {
  const name = round.scenario === null ? OPEN_INFO.name : SCENARIO_INFO[round.scenario].name;
  if (round.daily) return `Daily · ${name}`;
  if (round.level) return `Level ${round.level} · ${name}`;
  return name;
}

export function round_brief(round: Round): string {
  return round.scenario === null ? OPEN_INFO.brief : SCENARIO_INFO[round.scenario].brief;
}
