import { angle_between, type Pose } from "../../core/geometry";
import { arc, body_ends, type Placement } from "../../core/vehicle";
import { plan, type Move } from "../../core/planner";
import {
  can_lift,
  contact,
  depth_to,
  fork_fit,
  FORK_ROOM,
  load_pose,
  near_of,
  offset_of,
  placed_in,
  side_room,
  SPEC,
  type GameState,
  type Near,
  type Par,
  type Resting,
} from "./game";
import { PALLET, type Slot } from "./warehouse";
import { MAX_ANGLE } from "../../core/precision";

const MARGIN = 0.05;
const LINE = 0.05;
const REACH = 4.5;
const STAGE = 2.4;
const EXPANSIONS = 60_000;
const STEERING = [-1, -0.6, -0.25, -0.08, 0, 0.08, 0.25, 0.6, 1];
const SWITCH = 8;
const LINED_UP = (1 * Math.PI) / 180;
const SIDE_ROOM = 0.02;

export interface Leg {
  moves: Move[];
  end: Placement;
}

export interface JobPlan {
  moves: Move[];
  /** Changes of direction along the whole plan: what the game counts as moves. */
  reversals: number;
  distance: number;
  /** To each pallet, then with it to its target, in turn: what the proofs drive again. */
  legs: Leg[];
}

/** Drives straight on in short pieces until `done`, or null if something is touched or it runs out of reach first. */
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

function ahead_of(pose: Pose, distance: number): Pose {
  return { x: pose.x + Math.cos(pose.heading) * distance, y: pose.y + Math.sin(pose.heading) * distance, heading: pose.heading };
}

function lateral(pose: Pose, target: Pose): number {
  return Math.abs(-(target.x - pose.x) * Math.sin(pose.heading) + (target.y - pose.y) * Math.cos(pose.heading));
}

/**
 * A leg ends with a straight run in: the search only has to line the forklift up with the slot, as a driver does, and
 * the last stretch goes straight until the forks are fully in or the pallet sits in its target. At an upper tier that
 * run is the side view's, the forks raised into the slot (`blocked_in`).
 */
function leg(
  from: Placement,
  stage: Pose,
  lined_up: (pose: Placement) => boolean,
  done: (pose: Placement) => boolean,
  blocked: (pose: Placement) => boolean,
  near: Near,
  blocked_in: (pose: Placement) => boolean = blocked
): Leg | null {
  const finish = (pose: Placement) => lined_up(pose) && straight_in(pose, done, blocked_in) !== null;
  const found = plan(from, stage, near.base, { spec: SPEC, arrive: finish, blocked, max_expansions: EXPANSIONS, steering: STEERING, switch_cost: SWITCH });
  if (!found) return null;
  const last = found.path[found.path.length - 1];
  const run = straight_in(last, done, blocked_in)!;
  const moves = run > 0 ? [...found.moves, { steer: 0, distance: run }] : found.moves;
  return { moves, end: arc(last, 0, run) };
}

/**
 * The whole job as a driver could do it from the forklift's real start: to each pallet, forks fully and squarely in,
 * then with it on the forks to its target, every pallet in the way where the job has left it. After a lift or a
 * put-down at an upper tier the forks stay raised into that slot while they reach into it. Null when a leg can't be
 * found.
 */
export function plan_job(state: GameState): JobPlan | null {
  const { floor } = state;
  const near = near_of(floor);
  const mast = body_ends(SPEC).front;
  let items: Resting[] = state.loads.map((load) => ({ pose: load.pose, tier: load.tier }));
  let at: Placement = { x: state.car.x, y: state.car.y, heading: state.car.heading };
  let raised: Slot | null = null;
  const legs: Leg[] = [];
  for (let i = 0; i < floor.tasks.length; i++) {
    const task = floor.tasks[i];
    const pallet = items[i].pose;
    const upper_from = task.from.tier > 0 ? task.from : null;
    const upper_to = task.to.tier > 0 ? task.to : null;

    const was_raised = raised;
    // The search keeps the forks out from under an upper pallet, and the load out of an upper target's floor slot, as if
    // they stood on the floor: wandering in under them only cost it its expansions.
    const fenced = items.map((item, k) => (k === i ? { ...item, tier: 0 } : item));
    const empty = (pose: Placement) => contact(near, fenced, pose, null, was_raised, MARGIN) !== null;
    const empty_in = upper_from ? (pose: Placement) => contact(near, items, pose, null, upper_from, MARGIN) !== null : empty;
    const pick_stages = (upper_from ? [PALLET.length + 0.1, STAGE] : [STAGE]).map((back) => ahead_of(pallet, -(PALLET.length / 2 + mast + back)));
    // Lined up before the tips reach the pallet, with room inside the pockets' limits, as a driver would square up.
    const facing = (pose: Placement) => {
      const off = fork_fit(pose, pallet);
      return off.angle <= MAX_ANGLE - LINED_UP && Math.abs(off.side) <= FORK_ROOM - SIDE_ROOM && off.gap > PALLET.length && off.gap < REACH + PALLET.length;
    };
    let fetched: Leg | null = null;
    for (const stage of pick_stages) fetched ??= leg(at, stage, facing, (pose) => can_lift(fork_fit(pose, pallet)), empty, near, empty_in);
    if (!fetched) return null;
    legs.push(fetched);
    at = fetched.end;

    const offset = offset_of(at, pallet);
    const rest = items.filter((_, k) => k !== i);
    const fence = upper_to ? [...rest, { pose: upper_to.home, tier: 0 }] : rest;
    const loaded = (pose: Placement) => contact(near, fence, pose, load_pose(pose, offset), upper_from, MARGIN) !== null;
    const loaded_in = upper_to ? (pose: Placement) => contact(near, rest, pose, load_pose(pose, offset), upper_to, MARGIN) !== null : loaded;
    const reach_to = offset.x;
    const drop_stages = (upper_to ? [PALLET.length + 0.1, STAGE] : [STAGE]).map((back) => ahead_of(task.to.home, -(reach_to + back)));
    // At an upper tier the load has to stop short of the slot's face, where the side view raises it.
    const toward = (pose: Placement) => {
      const load = load_pose(pose, offset);
      if (upper_to && depth_to(load, upper_to) < PALLET.length) return false;
      return angle_between(load.heading, task.to.heading) <= MAX_ANGLE && lateral(load, task.to.home) <= side_room(task.to) && ahead(load, task.to.home);
    };
    let delivered: Leg | null = null;
    for (const stage of drop_stages) delivered ??= leg(at, stage, toward, (pose) => placed_in(load_pose(pose, offset), task.to), loaded, near, loaded_in);
    if (!delivered) return null;
    legs.push(delivered);
    at = delivered.end;
    const dropped = load_pose(at, offset);
    items = items.map((item, k) => (k === i ? { pose: dropped, tier: task.to.tier } : item));
    raised = upper_to;
  }
  const moves = legs.flatMap((each) => each.moves);
  return { moves, reversals: reversals(moves), distance: moves.reduce((sum, move) => sum + Math.abs(move.distance), 0), legs };
}

function ahead(from: Pose, target: Pose): boolean {
  const d = (target.x - from.x) * Math.cos(from.heading) + (target.y - from.y) * Math.sin(from.heading);
  return d > -0.05 && d < REACH;
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

/** Metres a second a careful driver averages round a warehouse, start and stop included. */
export const PAR_SPEED = 1.4;
/** Seconds per change of direction (stop, shift, set off), per lift or lower, and on top of that per one at an upper tier. */
export const PAR_TURN = 2.5;
export const PAR_FORK = 2;
export const PAR_RACK = 10;
export const PAR_SLACK = 1.25;

/**
 * The par time from the planner's path: its length at a careful pace, time for each of its changes of direction, for
 * each lift and lower and for each of those `racked` at an upper tier (raising, lining up, creeping in), plus a quarter
 * for slack, rounded up to 5 s.
 */
export function par_of(found: JobPlan, pallets: number, racked = 0): Par {
  const seconds = (found.distance / PAR_SPEED + found.reversals * PAR_TURN + pallets * 2 * PAR_FORK + racked * PAR_RACK) * PAR_SLACK;
  return { ms: Math.ceil(seconds / 5) * 5000 };
}

/** Lifts and put-downs of the job at an upper tier. */
export function racked(state: Pick<GameState, "floor">): number {
  return state.floor.tasks.reduce((count, task) => count + (task.from.tier > 0 ? 1 : 0) + (task.to.tier > 0 ? 1 : 0), 0);
}
