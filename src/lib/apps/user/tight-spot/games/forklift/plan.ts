import { angle_between, type Pose } from "../../core/geometry";
import { obstacles } from "../../core/obstacles";
import { arc, body_ends, type Placement } from "../../core/vehicle";
import { plan, type Move } from "../../core/planner";
import {
  can_lift,
  contact,
  fork_fit,
  JAM_SIDE,
  load_pose,
  offset_of,
  placed_in,
  SPEC,
  type GameState,
  type Par,
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

function along(pose: Pose, distance: number): Pose {
  return { x: pose.x + Math.cos(pose.heading) * distance, y: pose.y + Math.sin(pose.heading) * distance, heading: pose.heading };
}

function lateral(pose: Pose, target: Pose): number {
  return Math.abs(-(target.x - pose.x) * Math.sin(pose.heading) + (target.y - pose.y) * Math.cos(pose.heading));
}

/**
 * A leg ends with a straight run in: the search only has to line the forklift up with the slot, as a driver does, and
 * the last stretch goes straight until the forks are fully in or the pallet sits in its target.
 */
function leg(
  from: Placement,
  stage: Pose,
  lined_up: (pose: Placement) => boolean,
  done: (pose: Placement) => boolean,
  blocked: (pose: Placement) => boolean,
  near: ReturnType<typeof obstacles>
): Leg | null {
  const finish = (pose: Placement) => lined_up(pose) && straight_in(pose, done, blocked) !== null;
  const found = plan(from, stage, near, { spec: SPEC, arrive: finish, blocked, max_expansions: EXPANSIONS, steering: STEERING, switch_cost: SWITCH });
  if (!found) return null;
  const last = found.path[found.path.length - 1];
  const run = straight_in(last, done, blocked)!;
  const moves = run > 0 ? [...found.moves, { curvature: 0, distance: run }] : found.moves;
  return { moves, end: arc(last, 0, run) };
}

/**
 * The whole job as a driver could do it from the forklift's real start: to each pallet, forks fully and squarely in,
 * then with it on the forks to its target, every pallet in the way where the job has left it. Null when a leg can't be
 * found.
 */
export function plan_job(state: GameState): JobPlan | null {
  const { floor } = state;
  const near = obstacles(floor);
  const mast = body_ends(SPEC).front;
  let poses = state.loads.map((load) => load.pose);
  let at: Placement = { x: state.car.x, y: state.car.y, heading: state.car.heading };
  const legs: Leg[] = [];
  for (let i = 0; i < floor.tasks.length; i++) {
    const task = floor.tasks[i];
    const others = (except: number) => poses.filter((_, k) => k !== except);
    const pallet = poses[i];

    const empty = (pose: Placement) => contact(near, poses, pose, null, MARGIN) !== null;
    const pick_stage = along({ ...pallet, heading: pallet.heading }, -(PALLET.length / 2 + mast + STAGE));
    const facing = (pose: Placement) => {
      const off = fork_fit(pose, pallet);
      return off.angle <= MAX_ANGLE && Math.abs(off.side) <= JAM_SIDE && off.gap > 0 && off.gap < REACH + PALLET.length;
    };
    const fetched = leg(at, pick_stage, facing, (pose) => can_lift(fork_fit(pose, pallet)), empty, near);
    if (!fetched) return null;
    legs.push(fetched);
    at = fetched.end;

    const offset = offset_of(at, pallet);
    const rest = others(i);
    const loaded = (pose: Placement) => contact(near, rest, pose, load_pose(pose, offset), MARGIN) !== null;
    const reach_to = offset.x;
    const drop_stage = along(task.to.home, -(reach_to + STAGE));
    const toward = (pose: Placement) => {
      const load = load_pose(pose, offset);
      return angle_between(load.heading, task.to.heading) <= MAX_ANGLE && lateral(load, task.to.home) <= slack(task.to) && ahead(load, task.to.home);
    };
    const delivered = leg(at, drop_stage, toward, (pose) => placed_in(load_pose(pose, offset), task.to), loaded, near);
    if (!delivered) return null;
    legs.push(delivered);
    at = delivered.end;
    const dropped = load_pose(at, offset);
    poses = poses.map((pose, k) => (k === i ? dropped : pose));
  }
  const moves = legs.flatMap((each) => each.moves);
  return { moves, reversals: reversals(moves), distance: moves.reduce((sum, move) => sum + Math.abs(move.distance), 0), legs };
}

function slack(slot: Slot): number {
  const xs = slot.shape.map((p) => p.x);
  const ys = slot.shape.map((p) => p.y);
  const across = Math.abs(Math.cos(slot.heading)) > 0.5 ? Math.max(...ys) - Math.min(...ys) : Math.max(...xs) - Math.min(...xs);
  return Math.max(0.02, (across - PALLET.width) / 2);
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
/** Seconds per change of direction (stop, shift, set off) and per lift or lower. */
export const PAR_TURN = 2.5;
export const PAR_FORK = 2;
export const PAR_SLACK = 1.25;

/**
 * The par time from the planner's path: its length at a careful pace, time for each of its changes of direction and
 * for each lift and lower, plus a quarter for slack, rounded up to 5 s.
 */
export function par_of(found: JobPlan, pallets: number): Par {
  const seconds = (found.distance / PAR_SPEED + found.reversals * PAR_TURN + pallets * 2 * PAR_FORK) * PAR_SLACK;
  return { ms: Math.ceil(seconds / 5) * 5000 };
}
