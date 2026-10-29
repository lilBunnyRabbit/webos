import { z } from "zod";
import { inside_convex } from "../../core/collision";
import { angle_between, type Vec } from "../../core/geometry";
import { fit, MAX_ANGLE, type Precision } from "../../core/precision";
import { collide, obstacles } from "../../core/obstacles";
import { pass_portals } from "../../core/portals";
import {
  bodies,
  create_car,
  Gear,
  headings,
  hitch_point,
  jackknife,
  set_crab,
  shift,
  step,
  Vehicle,
  VEHICLES,
  type Car,
  type Input,
  type Placement,
  type VehicleSpec,
} from "../../core/vehicle";
import { open_world, type World } from "../../core/lot";
import {
  hash,
  Scenario,
  SCENARIOS,
  scenario_world,
  type Bay,
  type Solid,
  type SolidKind,
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

export { MAX_ANGLE };

const CARS: readonly Vehicle[] = [Vehicle.HATCH, Vehicle.VAN, Vehicle.PICKUP];
const CAR_LIKES: readonly Vehicle[] = [...CARS, Vehicle.CITY, Vehicle.SUV, Vehicle.GT, Vehicle.TAXI, Vehicle.POLICE, Vehicle.AMBULANCE, Vehicle.TUK_TUK, Vehicle.GOLF_CART];
const ROOMY: readonly Vehicle[] = [...CAR_LIKES, Vehicle.LIMO, Vehicle.CAMPER];
// The machines the planner proves in the car kinds: the skid steers everywhere, the tank and the telehandler where
// their width still leaves room.
const SKIDS: readonly Vehicle[] = [Vehicle.BOBCAT, Vehicle.MOWER];
const WIDE_MACHINES: readonly Vehicle[] = [...SKIDS, Vehicle.TANK, Vehicle.TELEHANDLER];

interface ScenarioInfo {
  name: string;
  brief: string;
  par: number;
  /** The round's seed picks one; the lot sizes its bays and gaps to it. Only those the planner proves the kind with. */
  vehicles: readonly Vehicle[];
  /** What a level's seed picks from instead, when not all of them: the vehicles the kind had when its levels were laid out, so they keep their layouts. */
  ladder?: readonly Vehicle[];
}

export const SCENARIO_INFO: Record<Scenario, ScenarioInfo> = {
  parallel: { name: "Parallel", brief: "Slot in between the two cars along the kerb.", par: 2, vehicles: [...ROOMY, ...SKIDS, Vehicle.TELEHANDLER], ladder: CARS },
  forward: { name: "Nose in", brief: "Drive forward into the marked bay.", par: 0, vehicles: [...ROOMY, ...WIDE_MACHINES], ladder: CARS },
  reverse: { name: "Reverse in", brief: "Back into the marked bay, nose out.", par: 1, vehicles: [...ROOMY, ...WIDE_MACHINES], ladder: CARS },
  angled: { name: "Angled", brief: "Turn into the slanted bay, nose first.", par: 0, vehicles: [...CAR_LIKES, ...SKIDS], ladder: CARS },
  garage: {
    name: "Garage",
    brief: "Drive in and stop close to the back wall. Listen to the sensors.",
    par: 0,
    vehicles: [...ROOMY, ...WIDE_MACHINES],
    ladder: CARS,
  },
  pillars: {
    name: "Pillars",
    brief: "Squeeze past the pillar into the bay, either way round.",
    par: 1,
    vehicles: [...ROOMY, ...WIDE_MACHINES],
    ladder: CARS,
  },
  underground: {
    name: "Underground",
    brief: "Down the ramp into the garage, along the aisle and in between the pillars, either way round.",
    par: 1,
    vehicles: [Vehicle.HATCH, Vehicle.CITY, Vehicle.SUV, Vehicle.PICKUP, Vehicle.VAN, Vehicle.GT],
    ladder: [Vehicle.HATCH, Vehicle.CITY, Vehicle.SUV, Vehicle.PICKUP, Vehicle.VAN],
  },
  "multi-storey": {
    name: "Multi-storey",
    brief: "Down the ramps to the floor with the free bay. Every ramp ends in a tight turn.",
    par: 2,
    vehicles: [Vehicle.HATCH, Vehicle.CITY, Vehicle.SUV],
  },
  narrow: { name: "Narrow aisle", brief: "Cars on both sides and little room to swing.", par: 2, vehicles: [...ROOMY, ...WIDE_MACHINES], ladder: CARS },
  door: { name: "Garage door", brief: "Turn off a narrow alley through a tight door.", par: 2, vehicles: [...CAR_LIKES, ...SKIDS], ladder: CARS },
  "dead-end": {
    name: "Dead end",
    brief: "Turn round in the street and stop in the box facing out.",
    par: 2,
    vehicles: [...CAR_LIKES, Vehicle.LIMO, ...SKIDS],
    ladder: CARS,
  },
  "end-bay": {
    name: "End bay",
    brief: "The last free bay is in the corner at the end of a full aisle. No room to swing: take it in turns.",
    par: 2,
    vehicles: [...ROOMY, ...WIDE_MACHINES],
    ladder: CARS,
  },
  "bus-stop": {
    name: "Bus stop",
    brief: "Pull into the stop box along the kerb, short of anything parked ahead. The tail swings out as you straighten.",
    par: 1,
    vehicles: [Vehicle.BUS, Vehicle.DECKER, Vehicle.ARTIC, Vehicle.BOX_TRUCK, Vehicle.LOADER],
    ladder: [Vehicle.BUS],
  },
  depot: {
    name: "Depot",
    brief: "Park in your lane between the parked buses, facing the way its arrow points.",
    par: 1,
    vehicles: [
      Vehicle.BUS,
      Vehicle.COACH,
      Vehicle.DECKER,
      Vehicle.GARBAGE,
      Vehicle.FIRE,
      Vehicle.ARTIC,
      Vehicle.BOX_TRUCK,
      Vehicle.LOADER,
      Vehicle.DUMPER,
      Vehicle.LADDER,
    ],
    ladder: [Vehicle.BUS],
  },
  driveway: {
    name: "Driveway",
    brief: "Back the trailer off the street through the gate. Steer the other way to swing it.",
    par: 2,
    vehicles: [Vehicle.TOWING, Vehicle.HORSE_BOX, Vehicle.QUAD],
    ladder: [Vehicle.TOWING],
  },
  slipway: {
    name: "Slipway",
    brief: "Back the trailer down the ramp to the water, between the posts.",
    par: 2,
    vehicles: [Vehicle.TOWING, Vehicle.BOAT],
    ladder: [Vehicle.TOWING],
  },
  camping: {
    name: "Camping pitch",
    brief: "Back the caravan onto the empty pitch between the hedges, car facing the track.",
    par: 2,
    vehicles: [Vehicle.CARAVAN],
  },
  "loading-dock": {
    name: "Loading dock",
    brief: "Line up at the free dock door between the trucks, the way its arrow points.",
    par: 2,
    vehicles: [Vehicle.SEMI, Vehicle.BOX_TRUCK, Vehicle.DRAWBAR, Vehicle.ROAD_TRAIN, Vehicle.LOADER, Vehicle.DUMPER, Vehicle.LADDER],
    ladder: [Vehicle.SEMI],
  },
};

export const OPEN_INFO = {
  name: "Open lot",
  brief: "Drive around and park in any free bay.",
  par: 1,
  vehicles: [Vehicle.HATCH, Vehicle.VAN, Vehicle.PICKUP, Vehicle.GT, Vehicle.TOWING, Vehicle.F1, Vehicle.TUK_TUK, Vehicle.GOLF_CART, Vehicle.MOTORCYCLE] as readonly Vehicle[],
};

export type VehiclePick = Vehicle | typeof ANY;

/** The vehicles a picker offers for a kind, or for the open lot with `null`. */
export function vehicles_for(scenario: Scenario | null): readonly Vehicle[] {
  return scenario === null ? OPEN_INFO.vehicles : SCENARIO_INFO[scenario].vehicles;
}

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
type HitKind = SolidKind | typeof JACKKNIFE;

export interface Hit {
  kind: HitKind;
  /** Which hinge folded too far, on a rig with more than one. */
  hinge?: number;
  /** A parked truck or trailer rather than a car. */
  truck?: boolean;
}

const TRUCKS: ReadonlySet<Vehicle | undefined> = new Set([Vehicle.SEMI, Vehicle.BOX_TRUCK]);

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
  hit: Hit | null;
  bay: Bay | null;
  /** Counts the portals passed, so the screen can cut the camera to the car's new place. */
  passes: number;
}

export function spec_of(round: Round): VehicleSpec {
  return VEHICLES[round.vehicle];
}

/** A picked vehicle the kind allows wins; otherwise the seed picks one, the same one for the same seed. */
export function vehicle_for(scenario: Scenario | null, seed: number, pick: VehiclePick = ANY): Vehicle {
  const choices = vehicles_for(scenario);
  if (pick !== ANY && choices.includes(pick)) return pick;
  return choices[hash(seed, 13) % choices.length];
}

function ladder_vehicle(scenario: Scenario, seed: number): Vehicle {
  const info = SCENARIO_INFO[scenario];
  const choices = info.ladder ?? info.vehicles;
  return choices[hash(seed, 13) % choices.length];
}

export function world_for(round: Round): World {
  if (round.mode === Mode.OPEN || round.scenario === null) return open_world(round.seed, spec_of(round));
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
    passes: 0,
  };
}

export function set_status(state: GameState, status: Status): GameState {
  return state.status === status ? state : { ...state, status };
}

function lined_up(heading: number, bay: Bay): boolean {
  const off = angle_between(heading, bay.heading);
  return off <= MAX_ANGLE || (bay.either && Math.PI - off <= MAX_ANGLE);
}

function inside(car: Placement, bay: Bay, spec: VehicleSpec): boolean {
  return bodies(car, spec).every((body) => body.every((corner) => inside_convex(corner, bay.shape)));
}

/** A trailer, or a frame steer's front frame, must be lined up with the bay too, not only the vehicle's body. */
export function parked_in(car: Placement, bay: Bay, spec: VehicleSpec = VEHICLES.hatch): boolean {
  if (!inside(car, bay, spec)) return false;
  return headings(car, spec).every((heading) => lined_up(heading, bay));
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
  const stepped = step(state.car, input, dt, spec);
  const car = pass_portals(stepped, state.world.portals);
  const passes = car === stepped ? state.passes : state.passes + 1;
  const ms = state.ms + dt * 1000;
  const folded = jackknife(car, spec);
  if (folded >= 0) {
    return {
      ...state,
      car: { ...car, speed: 0 },
      ms,
      passes,
      status: Status.CRASHED,
      contact: hitch_point(car, spec, folded),
      hit: spec.hitches.length > 1 ? { kind: JACKKNIFE, hinge: folded } : { kind: JACKKNIFE },
    };
  }
  const hit = collide(car, obstacles(state.world), spec);
  if (hit)
    return {
      ...state,
      car: { ...car, speed: 0 },
      ms,
      passes,
      status: Status.CRASHED,
      contact: hit.at,
      hit: TRUCKS.has(hit.solid.car?.vehicle) ? { kind: hit.solid.kind, truck: true } : { kind: hit.solid.kind },
    };
  return { ...state, car, ms, passes };
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

export function toggle_crab(state: GameState): GameState {
  if (state.status !== Status.DRIVING) return state;
  const car = set_crab(state.car, !state.car.crab, spec_of(state.round));
  return car === state.car ? state : { ...state, car };
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
  /** The best precision seen on this kind and vehicle, kept apart from which run is the best. */
  precision?: number;
}

export function better(a: Result | undefined, b: Result): boolean {
  if (!a) return true;
  return b.moves !== a.moves ? b.moves < a.moves : b.ms < a.ms;
}

export function round_key(round: Round): string {
  return `${round.scenario ?? Mode.OPEN}:${round.vehicle}`;
}

export const result_schema = z.object({
  moves: z.number().int().nonnegative(),
  ms: z.number().nonnegative(),
  precision: z.number().min(0).max(100).optional(),
});
export const bests_schema = z.record(z.string(), result_schema);
export type Bests = z.infer<typeof bests_schema>;

export function best_of(bests: Bests, round: Round): Result | undefined {
  return bests[round_key(round)];
}

export interface Recorded {
  bests: Bests;
  /** Fewer moves, or as many in less time: the run itself is the new best. */
  improved: boolean;
  first: boolean;
}

/** Order stays moves, then time; precision only ever rises, whichever run set it. */
export function record_best(bests: Bests, round: Round, result: Result): Recorded {
  const old = best_of(bests, round);
  const improved = better(old, result);
  const run = improved ? { moves: result.moves, ms: result.ms } : { moves: old!.moves, ms: old!.ms };
  const top = Math.max(old?.precision ?? -1, result.precision ?? -1);
  const next: Bests = { ...bests, [round_key(round)]: top >= 0 ? { ...run, precision: top } : run };
  return { bests: next, improved, first: old === undefined };
}

export { PERFECT, type Precision } from "../../core/precision";

/** How well a parked rig sits in its bay: every corner of the car and its trailers' boxes, the worst of their headings. */
export function precision(car: Placement, bay: Bay, spec: VehicleSpec = VEHICLES.hatch): Precision {
  return fit(bodies(car, spec).flat(), headings(car, spec), bay);
}

export const levels_schema = z.record(z.string(), z.number().int().min(1).max(3));
export type LevelStars = z.infer<typeof levels_schema>;
export const data_schema = z.object({ bests: bests_schema, levels: levels_schema, kinds: z.array(z.string()) });
export type ParkingData = z.infer<typeof data_schema>;
export const EMPTY_DATA: ParkingData = { bests: {}, levels: {}, kinds: [] };

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
  Scenario.CAMPING,
  Scenario.LOADING_DOCK,
];
const BIG_KINDS_BEFORE = 5;
// Each kind that joined the laps later has its own seeds, so the levels before it keep theirs.
const LATER_SEEDS: Partial<Record<Scenario, number>> = { camping: 200, "loading-dock": 300 };
const LAPS = 3;
const PER_LAP = LAP.length + BIG_LAP.length;
const CAR_LEVELS = LAP.length * LAPS;
const LAP_LEVELS = PER_LAP * LAPS;
// The last lap: every kind at its tightest, the two garages last.
const HARDEST: readonly Scenario[] = [
  Scenario.PARALLEL,
  Scenario.GARAGE,
  Scenario.ANGLED,
  Scenario.REVERSE,
  Scenario.FORWARD,
  Scenario.PILLARS,
  Scenario.NARROW,
  Scenario.DOOR,
  Scenario.DEAD_END,
  Scenario.END_BAY,
  Scenario.BUS_STOP,
  Scenario.DEPOT,
  Scenario.DRIVEWAY,
  Scenario.SLIPWAY,
  Scenario.CAMPING,
  Scenario.LOADING_DOCK,
  Scenario.UNDERGROUND,
  Scenario.MULTI_STOREY,
];
export const LEVEL_COUNT = LAP_LEVELS + HARDEST.length;

/**
 * Three laps, each tighter and busier than the last: the nine original car spots, then the newer ones. A car spot
 * keeps the difficulty and seed it had when the ladder was 27 car levels long. Then the hardest lap, every kind at
 * difficulty 1, appended so the levels before it keep their numbers.
 */
export function level_round(level: number): Round {
  const index = Math.max(0, Math.min(LEVEL_COUNT - 1, level - 1));
  if (index >= LAP_LEVELS) {
    const scenario = HARDEST[index - LAP_LEVELS];
    const seed = hash(0x7195, 900 + index - LAP_LEVELS);
    return { mode: Mode.LEVELS, level: index + 1, scenario, difficulty: 1, seed, vehicle: ladder_vehicle(scenario, seed) };
  }
  const lap = Math.floor(index / PER_LAP);
  const at = index % PER_LAP;
  const base = { mode: Mode.LEVELS, level: index + 1 };
  if (at < LAP.length) {
    const old = lap * LAP.length + at;
    const scenario = LAP[at];
    const seed = hash(0x7195, old);
    return { ...base, scenario, difficulty: old / (CAR_LEVELS - 1), seed, vehicle: ladder_vehicle(scenario, seed) };
  }
  const k = at - LAP.length;
  const scenario = BIG_LAP[k];
  const seed = k < BIG_KINDS_BEFORE ? hash(0x7195, 100 + lap * BIG_KINDS_BEFORE + k) : hash(0x7195, LATER_SEEDS[scenario]! + lap);
  const difficulty = Math.min(1, (lap * LAP.length + 1.5 + k * 1.75) / (CAR_LEVELS - 1));
  return { ...base, scenario, difficulty, seed, vehicle: ladder_vehicle(scenario, seed) };
}

export function unlocked(levels: LevelStars): number {
  let highest = 1;
  for (const key of Object.keys(levels)) {
    const level = Number(key);
    if (Number.isInteger(level) && level >= 1) highest = Math.max(highest, level + 1);
  }
  return Math.min(LEVEL_COUNT, highest);
}

export function scenario_round(pick: ScenarioPick, seed: number, daily?: string, vehicle: VehiclePick = ANY): Round {
  const scenario = pick === ANY ? SCENARIOS[hash(seed, 3) % SCENARIOS.length] : pick;
  const difficulty = ((hash(seed, 5) % 1000) / 1000) * 0.85 + 0.15;
  return {
    mode: Mode.SCENARIO,
    scenario,
    difficulty,
    seed,
    vehicle: daily ? ladder_vehicle(scenario, seed) : vehicle_for(scenario, seed, vehicle),
    ...(daily ? { daily } : {}),
  };
}

/** The open lot has no Any: the hatchback unless another of its vehicles is picked. */
export function open_round(seed: number, pick: VehiclePick = Vehicle.HATCH): Round {
  const vehicle = pick !== ANY && OPEN_INFO.vehicles.includes(pick) ? pick : Vehicle.HATCH;
  return { mode: Mode.OPEN, scenario: null, difficulty: 0.3, seed, vehicle };
}

export const pick_schema = z.enum([ANY, ...SCENARIOS] as [ScenarioPick, ...ScenarioPick[]]);
export const vehicle_pick_schema = z.enum([ANY, ...Object.values(Vehicle)] as [VehiclePick, ...VehiclePick[]]);
export const mode_schema = z.enum(MODES as [Mode, ...Mode[]]);

export const HIT_NAMES: Record<SolidKind, string> = {
  car: "a parked car",
  wall: "a wall",
  pillar: "a pillar",
  post: "a post",
  kerb: "the kerb",
  shelf: "a shelf",
  water: "the water",
  rack: "a rack",
  pallet: "a pallet",
  hedge: "a hedge",
};

const ORDINALS = ["first", "second", "third", "fourth", "fifth"];

export function crash_title(hit: GameState["hit"]): string {
  if (!hit) return "Touched something";
  if (hit.kind === JACKKNIFE) return hit.hinge === undefined ? "Jackknifed the trailer" : `Jackknifed at the ${ORDINALS[hit.hinge]} hinge`;
  return hit.truck ? "Touched a parked truck" : `Touched ${HIT_NAMES[hit.kind]}`;
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
