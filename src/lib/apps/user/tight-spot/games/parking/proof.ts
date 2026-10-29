import { angle_between } from "../../core/geometry";
import { collide, obstacles, type Obstacles } from "../../core/obstacles";
import { drive, inflate, plan, type Move } from "../../core/planner";
import { jackknifed, rig_length, VEHICLES, type Placement, type Vehicle, type VehicleSpec } from "../../core/vehicle";
import { create_game, Mode, parked_in, SCENARIO_INFO, spec_of, verdict, type GameState } from "./game";
import { parked_poses } from "./poses";
import { Scenario, type Bay } from "./world";

/** The vehicles a kind gained after its levels were laid out; a look on a spec already proven there needs no proof. */
export function added(scenario: Scenario): Vehicle[] {
  const info = SCENARIO_INFO[scenario];
  if (!info.ladder) return [];
  const proven = new Set<VehicleSpec>(info.ladder.map((each) => VEHICLES[each]));
  return info.vehicles.filter((each) => {
    if (proven.has(VEHICLES[each])) return false;
    proven.add(VEHICLES[each]);
    return true;
  });
}

/** The seeds of one kind, vehicle and difficulty that don't park: none when the kind is proven there. */
export function unreached(scenario: Scenario, vehicle: Vehicle, difficulty: number, seeds: number): number[] {
  const failed: number[] = [];
  for (let seed = 1; seed <= seeds; seed++) {
    const state = create_game({ mode: Mode.SCENARIO, scenario, difficulty, seed: seed * 7919, vehicle });
    if (state.world.bays.length !== 1 || !reachable(state, false)) failed.push(seed);
  }
  return failed;
}

/**
 * Two proofs. From the start: a search from the car exactly as `create_game` places it (a trailer straight behind)
 * until the game's own judging calls it parked; every node is a placement the moves really reach, so the path is one a
 * driver can drive, reversing a trailer included. Out of the bay: a search from a parked pose to near the start, the
 * same path backwards getting in since a car has no slip; cheaper, and only sound without a trailer, so the seed sweeps
 * of car kinds use it and a trailer, or a fixed level, always goes from the start.
 */
// A towed section straightens behind a vehicle driving straight, so in a spot entered forwards (a bus stop) the search
// only has to line the front up: from there the rig pulls straight ahead until the game calls it parked. The coarse
// hitch bins of a forward-only search can't line both up on their own, and with reversing allowed an 18 m bus from
// the road takes the search 10–30 s a seed.
const PULL_UP: ReadonlySet<Scenario> = new Set(["bus-stop"]);
const PULL_UP_RANGE = 20;
const PULL_UP_ANGLE = (3 * Math.PI) / 180;

function pull_up(at: Placement, bay: Bay, near: Obstacles, spec: VehicleSpec, body: VehicleSpec): number | null {
  if (angle_between(at.heading, bay.heading) > PULL_UP_ANGLE) return null;
  let pose = at;
  for (let s = 0; s <= Math.max(PULL_UP_RANGE, rig_length(spec)); s += PIECE) {
    if (parked_in(pose, bay, spec)) return s;
    pose = drive(pose, { steer: 0, distance: PIECE }, spec);
    if (collide(pose, near, body)) return null;
  }
  return null;
}

export function reachable(state: GameState, from_start: boolean): boolean {
  const { world, car } = state;
  const spec = spec_of(state.round);
  const near = obstacles(world);
  const bay = world.bays[0];
  const start: Placement = { x: car.x, y: car.y, heading: car.heading, trailers: car.trailers };
  const scenario = state.round.scenario;
  const straight =
    (spec.hitches.length > 0 && scenario !== null && PULL_UP.has(scenario)) ||
    (spec.hitches.length > 1 && scenario === Scenario.LOADING_DOCK);
  // A semi waits set up at the dock, its tail at the door: one reverse in is what a driver does from there, and a
  // search in reverse only finds it in a second or two; the odd start that needs a shunt gets the full search.
  const backs = spec.hitches.length === 1 && scenario === Scenario.LOADING_DOCK;
  const body = inflate(spec, 0.05);
  const arrive = straight
    ? (at: Placement) => pull_up(at, bay, near, spec, body) !== null
    : (at: Placement) => parked_in(at, bay, spec);
  // The round starts with a frame steer's joint straight, and bending standing still swings both frames, so the way out
  // has to end straight too for its reverse to start where the round does.
  const near_start = (at: Placement) =>
    Math.hypot(at.x - world.start.x, at.y - world.start.y) <= OUT_REACH &&
    angle_between(at.heading, world.start.heading) <= OUT_TURN &&
    Math.abs(at.steer ?? 0) < 1e-9;
  // A few of the most central poses per way round: the search's coarse closed set can miss with one and not the next.
  const tried = new Map<number, number>();
  return parked_poses(bay, near, 0.05, spec).some((pose) => {
    const count = tried.get(pose.heading) ?? 0;
    if (count >= 3) return false;
    tried.set(pose.heading, count + 1);
    if (!from_start && spec.hitches.length === 0) return plan(pose, world.start, near, { spec, arrive: near_start }) !== null;
    const found =
      plan(start, pose, near, { spec, arrive, directions: straight ? [1] : backs ? [-1] : undefined }) ??
      (backs ? plan(start, pose, near, { spec, arrive }) : null);
    if (!found) return false;
    const end = straight ? pull_up(found.path.at(-1)!, bay, near, spec, body) : null;
    const moves = end ? [...found.moves, { steer: 0, distance: end }] : found.moves;
    if (!parks(state, moves)) throw new Error("the path the search found doesn't park when driven");
    return true;
  });
}

const PIECE = 0.15;
const OUT_REACH = 1.5;
const OUT_TURN = Math.PI / 6;

/** Drives the moves from the round's start in the search's own pieces and judges where they end as a round would. */
function parks(state: GameState, moves: readonly Move[]): boolean {
  const spec = spec_of(state.round);
  const near = obstacles(state.world);
  let at: Placement = state.car;
  for (const move of moves) {
    const pieces = Math.max(1, Math.round(Math.abs(move.distance) / PIECE));
    for (let k = 0; k < pieces; k++) {
      at = drive(at, { ...move, distance: move.distance / pieces }, spec);
      if (jackknifed(at, spec) || collide(at, near, spec)) return false;
    }
  }
  return verdict({ ...state, car: { ...state.car, ...at } }) === "inside";
}
