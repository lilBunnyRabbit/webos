import { angle_between, centroid, wrap_angle, type Pose, type Vec } from "$kit/games/play2d/geometry";
import { drive, plan, type Move } from "../../core/planner";
import { arc, COUPLE_REACH, COUPLE_SQUARE, couple, coupler, create_car, drop, folds, Gear, max_steer, trailer_pose, type Placement, type Unhooked, type VehicleSpec } from "../../core/vehicle";
import { contact, near_of, placed_in, SPEC, type GameState, type Par } from "./game";
import { DEPTH, box_reach, mouth_of, type Target, type Yard } from "./freight";

const MARGIN = 0.05;
const LINE = 0.02;
const REACH = 8;
const STAGE = 4;
const EXPANSIONS = 80_000;
const STEERING = [-1, -0.6, -0.25, -0.08, 0, 0.08, 0.25, 0.6, 1];
const SWITCH = 8;
const SQUARED = COUPLE_SQUARE - (3 * Math.PI) / 180;

export interface Leg {
  moves: Move[];
  end: Placement;
}

export interface JobPlan {
  moves: Move[];
  reversals: number;
  distance: number;
  /** Under each chain, then with it to its target, in turn: what the proofs drive again. */
  legs: Leg[];
}

function ahead(pose: Pose, distance: number): Placement {
  return { x: pose.x + Math.cos(pose.heading) * distance, y: pose.y + Math.sin(pose.heading) * distance, heading: pose.heading };
}

/** Backs straight on in 2 cm pieces until the coupler latches, or null if something is touched or it runs out of reach. */
function back_under(from: Placement, spec: VehicleSpec, stand: Unhooked, blocked: (pose: Placement) => boolean): number | null {
  let at = from;
  for (let travelled = 0; travelled <= REACH; travelled += LINE) {
    if (couple(create_car(at, Gear.REVERSE, spec), spec, stand)) return travelled;
    const next = arc(at, 0, -LINE);
    if (blocked(next)) return null;
    at = next;
  }
  return null;
}

/** Where the rig stands straight in a target with its chain's box centred: the goal the search steers toward. */
function parked_goal(target: Target, spec: VehicleSpec, links: number): Placement {
  const chain = spec.hitches.slice(-links);
  const first = chain[0];
  const heading = target.heading;
  const mouth = mouth_of(target);
  const reach = box_reach(chain);
  const room = target.back_in ? DEPTH : Math.abs(centroid(target.shape).x - mouth.x) * 2;
  const gap = (room - reach) / 2;
  const front = ahead({ ...mouth, heading }, -gap);
  const hinge = ahead(front, first.drawbar);
  return { ...ahead({ ...hinge, heading }, first.hitch), heading };
}

/**
 * The whole job as a driver could do it from the shunter's real start: to each chain, backed straight under its hinge
 * until it latches, then with it to its target (backed into a door or a bay, pulled into an outbound box), dropped,
 * every other chain where the job has left it. Null when a leg can't be found.
 */
export function plan_job(
  state: Pick<GameState, "yard" | "car" | "stands">,
  expansions = EXPANSIONS,
): JobPlan | null {
  const yard: Yard = state.yard;
  const near = near_of(yard);
  let stands = [...state.stands];
  let at: Placement = { x: state.car.x, y: state.car.y, heading: state.car.heading };
  let spec: VehicleSpec = SPEC;
  const legs: Leg[] = [];
  for (const task of yard.tasks) {
    const stand = stands[task.unit]!;
    const others = stands.map((each, i) => (i === task.unit ? null : each));
    const solo = (pose: Placement) => contact(yard, stands, pose, SPEC, MARGIN) !== null;
    const heading = stand.trailers[0].heading;
    const link = stand.links[0];
    const stage = ahead({ ...stand.hinge, heading }, STAGE + link.hitch);
    // Straight back, the coupler moves along the shunter's heading: where it crosses the hinge decides the latch.
    const lined = (pose: Placement) => {
      if (angle_between(pose.heading, heading) > SQUARED) return false;
      const end = coupler(pose, SPEC, link);
      const dx = stand.hinge.x - end.x;
      const dy = stand.hinge.y - end.y;
      const behind = -(dx * Math.cos(pose.heading) + dy * Math.sin(pose.heading));
      const side = -dx * Math.sin(pose.heading) + dy * Math.cos(pose.heading);
      if (behind < -0.05 || behind > REACH || Math.abs(side) > COUPLE_REACH * 0.6) return false;
      return back_under(pose, SPEC, stand, solo) !== null;
    };
    const found = plan(at, stage, near, { spec: SPEC, arrive: lined, blocked: solo, max_expansions: expansions, steering: STEERING, switch_cost: SWITCH });
    if (!found) return null;
    const last = found.path[found.path.length - 1];
    const run = back_under(last, SPEC, stand, solo)!;
    const under = arc(last, 0, -run);
    legs.push({ moves: run > 0 ? [...found.moves, { steer: 0, distance: -run }] : found.moves, end: under });
    const coupled = couple(create_car(under, Gear.REVERSE, SPEC), SPEC, stand)!;
    spec = coupled.spec;
    at = { x: coupled.car.x, y: coupled.car.y, heading: coupled.car.heading, trailers: coupled.car.trailers };

    const rig = spec;
    const towing = (pose: Placement) => contact(yard, others, pose, rig, MARGIN) !== null;
    const towed = tow(at, rig, task.to, stand.links.length, towing, near, expansions);
    if (!towed) return null;
    const end = towed.end;
    legs.push(towed);
    const dropped = drop({ ...create_car(end, Gear.PARK, rig), trailers: end.trailers }, rig)!;
    stands = stands.map((each, i) => (i === task.unit ? dropped.unit : each));
    at = { x: end.x, y: end.y, heading: end.heading };
    spec = SPEC;
  }
  const moves = legs.flatMap((each) => each.moves);
  return { moves, reversals: reversals(moves), distance: moves.reduce((sum, move) => sum + Math.abs(move.distance), 0), legs };
}

// Where a rig waits to back into a slot, the way a driver sets up an alley dock: along the aisle, straight, the
// trailer's axle past the slot and out from its mouth.
const PAST = [4, 26];
const OUT = [3, 24];
const SET_UP = (25 * Math.PI) / 180;
const STRAIGHT = (25 * Math.PI) / 180;

/**
 * With the chain coupled, to its target: pulled nose first into a lane or box; backed into a slot in two searches, as
 * a driver does it: forward to a set-up along the aisle on one side of the slot or the other, then in reverse only
 * until every link is inside and straight.
 */
function tow(
  from: Placement,
  rig: VehicleSpec,
  target: Target,
  links: number,
  blocked: (pose: Placement) => boolean,
  near: ReturnType<typeof near_of>,
  expansions: number,
): Leg | null {
  const goal = parked_goal(target, rig, links);
  const inside = (pose: Placement) => placed_in(pose, rig, target);
  const options = { spec: rig, blocked, max_expansions: expansions, steering: STEERING, switch_cost: SWITCH };
  if (!target.back_in) {
    for (const change of LANE_CHANGES) {
      const pulled = pull_through(from, rig, target, change, inside, blocked);
      if (!pulled) continue;
      return pulled;
    }
    const found = plan(from, goal, near, { ...options, arrive: inside, directions: [1], max_expansions: Math.min(expansions, SET_UP_EXPANSIONS) });
    return found ? { moves: found.moves, end: found.path[found.path.length - 1] } : null;
  }
  const mouth = mouth_of(target);
  const out = { x: Math.cos(target.heading), y: Math.sin(target.heading) };
  const first = rig.hitches.length - links;
  const link = rig.hitches[first];
  const sides = [1, -1].map((side) => {
    const heading = target.heading + (side * Math.PI) / 2;
    const past = { x: Math.cos(heading), y: Math.sin(heading) };
    const set_up = (pose: Placement) => {
      const trailers = pose.trailers ?? [];
      if (trailers.slice(first).some((trailer) => angle_between(trailer.heading, heading) > SET_UP)) return false;
      if (angle_between(pose.heading, trailers[first].heading) > STRAIGHT) return false;
      const axle = trailer_pose(pose, rig, first);
      const dx = axle.x - mouth.x;
      const dy = axle.y - mouth.y;
      const a = dx * past.x + dy * past.y;
      const b = dx * out.x + dy * out.y;
      if (a < PAST[0] || a > PAST[1] || b < OUT[0] || b > OUT[1]) return false;
      return RADII.some((radius) => corner(axle, axle.heading + Math.PI, target, radius, tail_of(link)) !== null);
    };
    return { side, heading, past, set_up };
  });
  for (const { heading, set_up } of sides) {
    let tries = 0;
    for (const ready of pull_outs(from, rig, heading, blocked)) {
      if (!set_up(ready.end)) continue;
      if (tries++ >= BACK_TRIES) break;
      const backed = back_in(ready.end, rig, first, target, inside, blocked);
      if (!backed) continue;
      return { moves: [...ready.moves, ...backed.moves], end: backed.end };
    }
  }
  for (const { heading, past, set_up } of sides) {
    const axle = {
      x: mouth.x + past.x * (PAST[0] + PAST[1]) / 2 + out.x * (OUT[0] + OUT[1]) / 2,
      y: mouth.y + past.y * (PAST[0] + PAST[1]) / 2 + out.y * (OUT[0] + OUT[1]) / 2,
    };
    const hinge = ahead({ ...axle, heading }, link.axle);
    const stage = ahead({ ...hinge, heading }, link.hitch);
    const ready = plan(from, stage, near, { ...options, arrive: set_up, directions: [1], max_expansions: Math.min(expansions, SET_UP_EXPANSIONS) });
    if (!ready) continue;
    const there = ready.path[ready.path.length - 1];
    const backed = back_in(there, rig, first, target, inside, blocked);
    if (!backed) continue;
    return { moves: [...ready.moves, ...backed.moves], end: backed.end };
  }
  return null;
}

const LANE_CHANGES = [10, 14, 18, 7, 22];
const LOOKAHEAD = 6;

/**
 * Pulled through nose first: pure pursuit of a line that eases over onto the target's axis across `change` metres
 * (a cosine S), then runs down it; it stops at the first piece every link is inside and straight.
 */
function pull_through(from: Placement, rig: VehicleSpec, target: Target, change: number, inside: (pose: Placement) => boolean, blocked: (pose: Placement) => boolean): Leg | null {
  const lock = max_steer(rig);
  const heading = target.heading;
  const along = { x: Math.cos(heading), y: Math.sin(heading) };
  const across = { x: -along.y, y: along.x };
  const axis = centroid(target.shape);
  const offset = (from.x - axis.x) * across.x + (from.y - axis.y) * across.y;
  const point = (s: number) => {
    const share = s >= change ? 0 : 0.5 + 0.5 * Math.cos((Math.PI * s) / change);
    return { x: from.x + along.x * s + across.x * (-offset + offset * share), y: from.y + along.y * s + across.y * (-offset + offset * share) };
  };
  const run = new Run(from, PIECE, inside);
  let steer = 0;
  for (let piece = 0; piece < 600; piece++) {
    const at = run.at;
    if (run.settled()) return run.leg();
    const s = (at.x - from.x) * along.x + (at.y - from.y) * along.y;
    const aim = point(s + LOOKAHEAD);
    const alpha = wrap_angle(Math.atan2(aim.y - at.y, aim.x - at.x) - at.heading);
    const wanted = Math.max(-lock, Math.min(lock, Math.atan((2 * rig.wheelbase * Math.sin(alpha)) / LOOKAHEAD)));
    steer += Math.max(-lock * STEER_RATE, Math.min(lock * STEER_RATE, wanted - steer));
    const next = drive(at, { steer, distance: PIECE }, rig);
    if (blocked(next)) return run.leg();
    run.push(steer, next);
  }
  return null;
}

// How far a driver goes on once every link is inside, at most: the leg ends halfway through that stretch, so a replay
// a few millimetres off still ends inside.
const SETTLE = 8;

/** A driver's pieces, kept one by one so the leg can end in the middle of the stretch where the chain is inside. */
class Run {
  private readonly steers: number[] = [];
  private readonly poses: Placement[];
  private first = -1;

  constructor(
    from: Placement,
    private readonly piece: number,
    private readonly inside: (pose: Placement) => boolean
  ) {
    this.poses = [from];
  }

  get at(): Placement {
    return this.poses[this.poses.length - 1];
  }

  push(steer: number, pose: Placement) {
    this.steers.push(steer);
    this.poses.push(pose);
  }

  /** Inside long enough, or out again after being inside. */
  settled(): boolean {
    const now = this.inside(this.at);
    if (now && this.first < 0) this.first = this.poses.length - 1;
    return this.first >= 0 && (!now || this.poses.length - 1 - this.first >= SETTLE);
  }

  /** Null when the chain was never inside. */
  leg(): Leg | null {
    if (this.first < 0 && this.inside(this.at)) this.first = this.poses.length - 1;
    if (this.first < 0) return null;
    let last = this.first;
    while (last + 1 < this.poses.length && this.inside(this.poses[last + 1])) last++;
    const end = this.first + Math.floor((last - this.first) / 2);
    const moves: Move[] = [];
    for (const steer of this.steers.slice(0, end)) {
      const previous = moves[moves.length - 1];
      if (previous && previous.steer === steer) previous.distance += this.piece;
      else moves.push({ steer, distance: this.piece });
    }
    return { moves, end: this.poses[end] };
  }
}

const BACK_TRIES = 10;
const SET_UP_EXPANSIONS = 30_000;
const PULL_STRAIGHTS = [1, 4, 7, 10, 13, 16, 19];
const PULL_SHARES = [1, 0.75, 0.5];
const PULL_PIECE = 0.6;
const PULL_ALONG = 60;

/**
 * Ways out of where the rig stands onto a heading, as a driver pulls out of a slot: straight on for a while, a turn at
 * one of a few wheel positions until it faces that way, then straight on along it, each piece of that last stretch one
 * candidate. Every piece is checked against `blocked`.
 */
function* pull_outs(from: Placement, rig: VehicleSpec, heading: number, blocked: (pose: Placement) => boolean): Generator<Leg> {
  const lock = max_steer(rig);
  const turn = wrap_angle(heading - from.heading);
  for (const straight of PULL_STRAIGHTS) {
    let at = from;
    let clear = true;
    for (let s = 0; s < straight && clear; s++) {
      const next = drive(at, { steer: 0, distance: PULL_PIECE }, rig);
      if (blocked(next)) clear = false;
      else at = next;
    }
    if (!clear) break;
    const out = at;
    for (const share of Math.abs(turn) < 0.1 ? [0] : PULL_SHARES) {
      const steer = Math.sign(turn) * share * lock;
      let pose = out;
      let arc = 0;
      let ok = true;
      while (share > 0 && angle_between(pose.heading, heading) > 0.05 && arc < 60) {
        const next = drive(pose, { steer, distance: PULL_PIECE / 3 }, rig);
        if (blocked(next) || angle_between(next.heading, heading) > angle_between(pose.heading, heading) + 1e-9) {
          ok = false;
          break;
        }
        pose = next;
        arc += PULL_PIECE / 3;
      }
      if (!ok) continue;
      const base: Move[] = [{ steer: 0, distance: straight * PULL_PIECE }, ...(arc > 0 ? [{ steer, distance: arc }] : [])];
      for (let along = 0; along < PULL_ALONG; along += PULL_PIECE) {
        const next = drive(pose, { steer: 0, distance: PULL_PIECE }, rig);
        if (blocked(next)) break;
        pose = next;
        yield { moves: [...base, { steer: 0, distance: along + PULL_PIECE }], end: pose };
      }
    }
  }
}

const PIECE = 0.15;
const HORIZON = 2;
const CHOICES = 25;
const STEER_RATE = 0.12;
const RADII = [6, 8, 10, 12, 15, 18];
const FOLD_ROOM = (12 * Math.PI) / 180;
const SAMPLE = 0.2;

function tail_of(link: VehicleSpec["hitches"][number]): number {
  return link.box_length + link.drawbar - link.axle;
}

interface Track {
  points: { x: number; y: number }[];
  /** The way the trailer's axle moves at each point. */
  directions: number[];
}

interface Corner {
  d0: Vec;
  d1: Vec;
  meet: Vec;
  /** Along the line it backs down to where that meets the slot's axis. */
  t: number;
  turn: number;
  tangent: number;
}

// The arc has to fit between where the axle is and the slot's mouth: it starts on the line ahead and ends outside.
function corner(axle: Vec, moving: number, target: Target, radius: number, tail: number): Corner | null {
  const mouth = mouth_of(target);
  const into = target.heading + Math.PI;
  const d0 = { x: Math.cos(moving), y: Math.sin(moving) };
  const d1 = { x: Math.cos(into), y: Math.sin(into) };
  const cross = d0.x * d1.y - d0.y * d1.x;
  if (Math.abs(cross) < 0.2) return null;
  const t = ((mouth.x - axle.x) * d1.y - (mouth.y - axle.y) * d1.x) / cross;
  const meet = { x: axle.x + d0.x * t, y: axle.y + d0.y * t };
  const turn = Math.atan2(cross, d0.x * d1.x + d0.y * d1.y);
  const tangent = radius * Math.tan(Math.abs(turn) / 2);
  const out = (mouth.x - meet.x) * d1.x + (mouth.y - meet.y) * d1.y;
  if (t < tangent + 3 || out < tangent + tail + 0.5) return null;
  return { d0, d1, meet, t, turn, tangent };
}

/** The axle's way in: on along the line it backs down, an arc of `radius` onto the slot's axis, then down the axis. */
function alley_track(axle: Pose, moving: number, target: Target, depth: number, radius: number, tail: number): Track | null {
  const found = corner(axle, moving, target, radius, tail);
  if (!found) return null;
  const { d0, d1, meet, t, turn, tangent } = found;
  const mouth = mouth_of(target);
  const into = target.heading + Math.PI;
  const points: { x: number; y: number }[] = [];
  const directions: number[] = [];
  for (let s = 0; s < t - tangent; s += SAMPLE) {
    points.push({ x: axle.x + d0.x * s, y: axle.y + d0.y * s });
    directions.push(moving);
  }
  const start = { x: meet.x - d0.x * tangent, y: meet.y - d0.y * tangent };
  const sign = Math.sign(turn);
  const centre = { x: start.x - d0.y * radius * sign, y: start.y + d0.x * radius * sign };
  const steps = Math.ceil((Math.abs(turn) * radius) / SAMPLE);
  for (let i = 0; i < steps; i++) {
    const a = moving + (turn * i) / steps;
    points.push({ x: centre.x + Math.sin(a) * radius * sign, y: centre.y - Math.cos(a) * radius * sign });
    directions.push(a);
  }
  const end = { x: meet.x + d1.x * tangent, y: meet.y + d1.y * tangent };
  const left = (end.x - mouth.x) * -d1.x + (end.y - mouth.y) * -d1.y;
  for (let s = 0; s < depth + left + 2; s += SAMPLE) {
    points.push({ x: end.x + d1.x * s, y: end.y + d1.y * s });
    directions.push(into);
  }
  return { points, directions };
}

/**
 * A driver backing a trailer in along a track for its axle: every 15 cm it tries each wheel position held for the next
 * 2.4 m and turns the wheel toward the one that leaves the axle nearest the track and running along it, a hinge folding
 * near its limit ruled out. Null when it touches anything or ends outside.
 */
function follow_track(from: Placement, rig: VehicleSpec, link: number, track: Track, inside: (pose: Placement) => boolean, blocked: (pose: Placement) => boolean): Leg | null {
  const lock = max_steer(rig);
  const limit = rig.hitches[link].max_angle - FOLD_ROOM;
  const run = new Run(from, -PIECE, inside);
  let steer = from.steer ?? 0;
  let index = 0;
  const error = (pose: Placement, start: number) => {
    const axle = trailer_pose(pose, rig, link);
    let best = Infinity;
    let k = start;
    for (let i = start; i < Math.min(track.points.length, start + 80); i++) {
      const d = Math.hypot(axle.x - track.points[i].x, axle.y - track.points[i].y);
      if (d < best) {
        best = d;
        k = i;
      }
    }
    const heading = angle_between(axle.heading + Math.PI, track.directions[k]);
    return { k, cost: best * best + 4 * heading * heading };
  };
  for (let piece = 0; piece < 600; piece++) {
    const at = run.at;
    if (run.settled()) return run.leg();
    index = error(at, index).k;
    if (index >= track.points.length - 2) return run.leg();
    let wanted = steer;
    let lowest = Infinity;
    for (let c = 0; c < CHOICES; c++) {
      const candidate = -lock + (2 * lock * c) / (CHOICES - 1);
      const half = drive(at, { steer: candidate, distance: -HORIZON }, rig);
      const probe = drive(half, { steer: candidate, distance: -HORIZON }, rig);
      if (folds(probe, rig).some((fold) => Math.abs(fold) > limit)) continue;
      if (folds(half, rig).some((fold) => Math.abs(fold) > limit)) continue;
      const cost = error(probe, index).cost + error(half, index).cost + 0.05 * (candidate - steer) ** 2;
      if (cost < lowest) {
        lowest = cost;
        wanted = candidate;
      }
    }
    steer += Math.max(-lock * STEER_RATE, Math.min(lock * STEER_RATE, wanted - steer));
    const next = drive(at, { steer, distance: -PIECE }, rig);
    if (blocked(next)) return run.leg();
    run.push(steer, next);
  }
  return null;
}

/** Backs the rig into the slot along whichever radius onto the slot's axis works, the tightest first. */
function back_in(from: Placement, rig: VehicleSpec, link: number, target: Target, inside: (pose: Placement) => boolean, blocked: (pose: Placement) => boolean): Leg | null {
  const axle = trailer_pose(from, rig, link);
  for (const radius of RADII) {
    const track = alley_track(axle, axle.heading + Math.PI, target, DEPTH, radius, tail_of(rig.hitches[link]));
    if (!track) continue;
    const found = follow_track(from, rig, link, track, inside, blocked);
    if (found) return found;
  }
  return null;
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

/** Metres a second a careful shunter driver averages round a yard, starts and stops included. */
export const PAR_SPEED = 1.8;
/** Seconds per change of direction, per couple and per drop (the lines, the legs). */
export const PAR_TURN = 3;
export const PAR_HITCH = 4;
export const PAR_SLACK = 1.25;

/** The par time from the planner's path, a quarter on for slack, rounded up to 5 s. */
export function par_of(found: JobPlan, tasks: number): Par {
  const seconds = (found.distance / PAR_SPEED + found.reversals * PAR_TURN + tasks * 2 * PAR_HITCH) * PAR_SLACK;
  return { ms: Math.ceil(seconds / 5) * 5000 };
}
