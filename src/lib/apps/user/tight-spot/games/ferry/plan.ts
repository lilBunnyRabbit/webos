import { angle_between } from "../../core/geometry";
import { collide, obstacles, type Obstacles } from "../../core/obstacles";
import { inflate, plan, type Move } from "../../core/planner";
import { arc, body_centre, VEHICLES, type Placement, type VehicleSpec } from "../../core/vehicle";
import { lane_centre, type Deck, type Slot } from "./deck";
import { judge, stowed_solids, type Par, type Stowed } from "./game";

const MARGIN = 0.05;
const LINE = 0.05;
const REACH = 8;
const STAGE = 4;
const EXPANSIONS = 80_000;
const STEERING = [-1, -0.6, -0.25, -0.08, 0, 0.08, 0.25, 0.6, 1];
const SWITCH = 8;
const LINED_UP = (1 * Math.PI) / 180;
const SIDE = 0.08;
/** The straight run stops this far short of the one ahead: inside the 0.3 to 1 m a round allows, with room both ways. */
const STOP = 0.65;

export interface Leg {
  moves: Move[];
  end: Placement;
}

export interface SailingPlan {
  legs: Leg[];
  reversals: number;
  distance: number;
}

function straight_in(from: Placement, done: (pose: Placement) => boolean, blocked: (pose: Placement) => boolean): number | null {
  let at = from;
  for (let travelled = 0; travelled <= REACH; travelled += LINE) {
    if (done(at)) return travelled;
    const next = arc(at, 0, LINE);
    if (blocked(next)) return null;
    at = next;
  }
  return null;
}

/**
 * One vehicle from the quay to its slot's lane: the search only lines it up behind the slot, straight and on the lane's
 * middle, and a straight run up stops it short of the one ahead, as a driver creeps up to a bumper.
 */
export function plan_leg(deck: Deck, stowed: readonly Stowed[], from: Placement, slot: Slot, spec: VehicleSpec): Leg | null {
  const near: Obstacles = obstacles({ solids: [...deck.solids, ...stowed.flatMap((each) => each.solids)] });
  const grown = inflate(spec, MARGIN);
  const blocked = (pose: Placement) => collide(pose, near, grown) !== null;
  const middle = lane_centre(deck, slot.lane);
  const stopped = (pose: Placement) => {
    const verdict = judge(deck, stowed, pose, spec);
    return verdict.lane === slot.lane && verdict.gap <= STOP;
  };
  const lined_up = (pose: Placement) => {
    if (angle_between(pose.heading, 0) > LINED_UP) return false;
    const centre = body_centre(pose, spec);
    return Math.abs(centre.y - middle) <= SIDE && centre.x < slot.pose.x + 1 && centre.x > slot.pose.x - REACH;
  };
  const arrive = (pose: Placement) => lined_up(pose) && straight_in(pose, stopped, blocked) !== null;
  const stage = { x: slot.pose.x - STAGE, y: slot.pose.y, heading: 0 };
  const found = plan(from, stage, near, { spec, arrive, blocked, max_expansions: EXPANSIONS, steering: STEERING, switch_cost: SWITCH });
  if (!found) return null;
  const last = found.path[found.path.length - 1];
  const run = straight_in(last, stopped, blocked)!;
  const moves = run > 0 ? [...found.moves, { steer: 0, distance: run }] : found.moves;
  return { moves, end: arc(last, 0, run) };
}

/**
 * The whole sailing as a driver could load it: every vehicle in queue order from the quay to the lane its slot in the
 * packing is in, the ones before it where the plan left them. Null when a leg can't be found.
 */
export function plan_sailing(deck: Deck, from: (index: number) => Placement): SailingPlan | null {
  const legs: Leg[] = [];
  let stowed: Stowed[] = [];
  for (let i = 0; i < deck.queue.length; i++) {
    const vehicle = deck.queue[i];
    const spec = VEHICLES[vehicle];
    const found = plan_leg(deck, stowed, from(i), deck.plan[i], spec);
    if (!found) return null;
    legs.push(found);
    const verdict = judge(deck, stowed, found.end, spec);
    stowed = [...stowed, { vehicle, car: found.end, lane: verdict.lane, gap: verdict.gap, solids: stowed_solids(vehicle, found.end, i) }];
  }
  const moves = legs.flatMap((leg) => leg.moves);
  return { legs, reversals: reversals(moves), distance: moves.reduce((sum, move) => sum + Math.abs(move.distance), 0) };
}

export function reversals(moves: readonly Move[]): number {
  let count = 0;
  let last = 0;
  for (const move of moves) {
    const way = Math.sign(move.distance);
    if (way === 0) continue;
    if (last !== 0 && way !== last) count++;
    last = way;
  }
  return count;
}

/** Metres a second a careful driver averages up a ramp and along a deck. */
export const PAR_SPEED = 1.8;
/** Seconds per change of direction, and per vehicle to set off from the quay and settle into P. */
export const PAR_TURN = 2.5;
export const PAR_VEHICLE = 4;
export const PAR_SLACK = 1.25;

export function par_of(found: SailingPlan, vehicles: number): Par {
  const seconds = (found.distance / PAR_SPEED + found.reversals * PAR_TURN + vehicles * PAR_VEHICLE) * PAR_SLACK;
  return { ms: Math.ceil(seconds / 5) * 5000 };
}
