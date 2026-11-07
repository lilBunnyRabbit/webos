import { inside_convex } from "$kit/games/play2d/collision";
import { angle_between } from "$kit/games/play2d/geometry";
import { collide, obstacles, type Obstacles } from "../../core/obstacles";
import { drive, inflate, plan, type Move } from "../../core/planner";
import type { Portal } from "../../core/scene";
import { body_centre, headings, jackknifed, VEHICLES, type Placement, type VehicleSpec } from "../../core/vehicle";
import { lane_centre, on_upper, solids_for, type Cargo, type Deck, type Slot } from "./deck";
import { judge, stowed_solids, type Par, type Stowed } from "./game";

const MARGIN = 0.05;
const LINE = 0.05;
const REACH = 8;
const STAGE = 4;
const EXPANSIONS = 80_000;
const STEERING = [-1, -0.6, -0.25, -0.08, 0, 0.08, 0.25, 0.6, 1];
const SWITCH = 8;
const LINED_UP = (1 * Math.PI) / 180;
/** A trailer behind can't be squared up as finely before the straight run settles it. */
const TRAILER_LINED_UP = (3 * Math.PI) / 180;
const SIDE = 0.08;
/** The straight run stops this far short of the one ahead: inside the 0.3 to 1 m a round allows, with room both ways. */
const STOP = 0.65;
/** Where a vehicle for the upper deck aims to line up, short of the foot of the internal ramp, before driving straight up it. */
const RAMP_STAGE = 1.5;
// The ramp only has to be climbed clear of its walls, not stowed on: a looser line-up than a lane's.
const RAMP_SIDE = 0.3;
const RAMP_LINED_UP = (2 * Math.PI) / 180;
const OVER_THE_TOP = 1;
const CLIMB = 16;

export interface Leg {
  moves: Move[];
  end: Placement;
}

export interface SailingPlan {
  legs: Leg[];
  reversals: number;
  distance: number;
}

interface Run {
  distance: number;
  end: Placement;
}

function straight(from: Placement, done: (pose: Placement) => boolean, blocked: (pose: Placement) => boolean, spec: VehicleSpec, portals: readonly Portal[] = [], reach = REACH): Run | null {
  let at = from;
  for (let travelled = 0; travelled <= reach; travelled += LINE) {
    if (done(at)) return { distance: travelled, end: at };
    const next = drive(at, { steer: 0, distance: LINE }, spec, portals);
    if (blocked(next)) return null;
    at = next;
  }
  return null;
}

function squared(pose: Placement, spec: VehicleSpec): boolean {
  if (angle_between(pose.heading, 0) > LINED_UP) return false;
  return headings(pose, spec).every((heading) => angle_between(heading, 0) <= TRAILER_LINED_UP);
}

function in_mouth(pose: Placement, portals: readonly Portal[]): boolean {
  return portals.some((portal) => inside_convex(pose, portal.mouth));
}

/**
 * From `from` to the lane its slot is in, on the same deck: the search only lines it up behind the slot, straight and on
 * the lane's middle, and a straight run up stops it short of the one ahead, as a driver creeps up to a bumper. It keeps
 * out of the internal ramp's mouths, so the search never changes deck.
 */
function into_lane(deck: Deck, near: Obstacles, stowed: readonly Stowed[], from: Placement, slot: Slot, spec: VehicleSpec): Leg | null {
  const grown = inflate(spec, MARGIN);
  const hits = (pose: Placement) => jackknifed(pose, spec) || collide(pose, near, grown) !== null;
  const blocked = (pose: Placement) => hits(pose) || in_mouth(pose, deck.portals);
  const middle = lane_centre(deck, slot.lane);
  const stopped = (pose: Placement) => {
    const verdict = judge(deck, stowed, pose, spec);
    return verdict.lane === slot.lane && verdict.gap <= STOP;
  };
  const lined_up = (pose: Placement) => {
    if (!squared(pose, spec)) return false;
    const centre = body_centre(pose, spec);
    return Math.abs(centre.y - middle) <= SIDE && centre.x < slot.pose.x + 1 && centre.x > slot.pose.x - REACH;
  };
  const arrive = (pose: Placement) => lined_up(pose) && straight(pose, stopped, hits, spec) !== null;
  const stage = { x: slot.pose.x - STAGE, y: slot.pose.y, heading: 0 };
  const found = plan(from, stage, near, { spec, arrive, blocked, max_expansions: EXPANSIONS, steering: STEERING, switch_cost: SWITCH });
  if (!found) return null;
  const last = found.path[found.path.length - 1];
  const run = straight(last, stopped, hits, spec)!;
  const moves = run.distance > 0 ? [...found.moves, { steer: 0, distance: run.distance }] : found.moves;
  return { moves, end: run.end };
}

/** Lined up on the internal ramp short of its top, then straight up it until a body length onto the upper deck. */
function up_the_ramp(deck: Deck, near: Obstacles, from: Placement, spec: VehicleSpec): Leg | null {
  const upper = deck.upper!;
  const grown = inflate(spec, MARGIN);
  const hits = (pose: Placement) => jackknifed(pose, spec) || collide(pose, near, grown) !== null;
  const blocked = (pose: Placement) => hits(pose) || in_mouth(pose, deck.portals);
  const over = (pose: Placement) => on_upper(deck, pose.y) && pose.x >= upper.top + OVER_THE_TOP;
  const arrive = (pose: Placement) =>
    angle_between(pose.heading, 0) <= RAMP_LINED_UP && Math.abs(pose.y - upper.lane) <= RAMP_SIDE && pose.x < upper.top - 0.2 && pose.x > upper.foot - 3 && straight(pose, over, hits, spec, deck.portals, CLIMB) !== null;
  const stage = { x: upper.foot - RAMP_STAGE, y: upper.lane, heading: 0 };
  const found = plan(from, stage, near, { spec, arrive, blocked, max_expansions: EXPANSIONS, steering: STEERING, switch_cost: SWITCH });
  if (!found) return null;
  const last = found.path[found.path.length - 1];
  const run = straight(last, over, hits, spec, deck.portals, CLIMB)!;
  return { moves: [...found.moves, { steer: 0, distance: run.distance }], end: run.end };
}

/** One vehicle from the quay to its slot: for one on the upper deck, up the internal ramp first, then into its lane there. */
export function plan_leg(deck: Deck, stowed: readonly Stowed[], from: Placement, slot: Slot, spec: VehicleSpec, vehicle: Cargo): Leg | null {
  const near: Obstacles = obstacles({ solids: [...solids_for(deck, vehicle), ...stowed.flatMap((each) => each.solids)] });
  if (!deck.upper || slot.lane < deck.lanes) return into_lane(deck, near, stowed, from, slot, spec);
  const climb = up_the_ramp(deck, near, from, spec);
  if (!climb) return null;
  const park = into_lane(deck, near, stowed, climb.end, slot, spec);
  if (!park) return null;
  return { moves: [...climb.moves, ...park.moves], end: park.end };
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
    const found = plan_leg(deck, stowed, from(i), deck.plan[i], spec, vehicle);
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
