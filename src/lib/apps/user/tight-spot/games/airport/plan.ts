import { clamp, wrap_angle, type Vec } from "../../core/geometry";
import { collide, obstacles } from "../../core/obstacles";
import { drive, type Move } from "../../core/planner";
import { folds, max_steer, type Placement } from "../../core/vehicle";
import { AIRLINER } from "./aircraft";
import {
  aircraft_pose,
  contact,
  is_done,
  Job,
  judge,
  Phase,
  SPEC,
  STEERING_LIMIT,
  swap_to_push,
  TOW,
  type GameState,
  type Par,
} from "./game";
import { BAGGAGE, run_route, type TrainRun } from "./train";

const PIECE = 0.15;
const MARGIN = 0.3;
const FOLD_MARGIN = (8 * Math.PI) / 180;
const RADII = [16, 19, 22, 25, 28, 31, 34, 37, 40];
const RUN_OUT = 70;
const SAMPLE = 0.25;
// Outer loop on the main gear's path: about a 50 m period, critically damped.
const K_LATERAL = 0.015;
const K_HEADING = 0.25;
// Inner loop: the fold closes on the one the path asks for over about two metres of push.
const K_FOLD = 0.5;
const MAX_FOLD = (60 * Math.PI) / 180;
// The wheel's turn per piece, about what the keyboard wheel does at a pushback's pace.
const STEER_RATE = 0.07;

export interface PushPlan {
  moves: Move[];
  reversals: number;
  distance: number;
  radius: number;
}

interface Track {
  points: Vec[];
  /** The way the main gear moves at each point (the aircraft is pushed tail first). */
  directions: number[];
  curvature: number[];
}

/** Straight back off the stand, a quarter circle onto the taxiway, then along its centreline. */
function track(state: GameState, radius: number): Track | null {
  const { apron } = state;
  const start = aircraft_pose(state.car);
  const down = start.heading + Math.PI;
  const along = apron.heading + Math.PI;
  const turn_at = apron.centreline - radius;
  if (turn_at < start.y) return null;
  const points: Vec[] = [];
  const directions: number[] = [];
  const curvature: number[] = [];
  for (let y = start.y; y < turn_at; y += SAMPLE) {
    points.push({ x: start.x, y });
    directions.push(down);
    curvature.push(0);
  }
  const side = Math.cos(along) > 0 ? 1 : -1;
  const centre = { x: start.x + side * radius, y: turn_at };
  const sweep = Math.PI / 2;
  const steps = Math.ceil((sweep * radius) / SAMPLE);
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * sweep;
    points.push({ x: centre.x - side * radius * Math.cos(a), y: centre.y + radius * Math.sin(a) });
    directions.push(down - side * a);
    curvature.push(-side / radius);
  }
  for (let d = 0; d < RUN_OUT; d += SAMPLE) {
    points.push({ x: centre.x + side * d, y: apron.centreline });
    directions.push(along);
    curvature.push(0);
  }
  return { points, directions, curvature };
}

/** The steady fold that turns the pushed aircraft on curvature `kappa`, from the towing kinematics, by bisection. */
function fold_for(kappa: number): number {
  const h = -AIRLINER.hitch;
  const L = AIRLINER.axle;
  const turning = (beta: number) => {
    const tug = -Math.sin(beta) / (L + h * Math.cos(beta));
    return tug / (Math.cos(beta) - h * tug * Math.sin(beta));
  };
  let lo = -MAX_FOLD;
  let hi = MAX_FOLD;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (turning(mid) > kappa) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * A pushback driver: the main gear follows the track, by asking for the fold that turns the aircraft back onto it, and
 * the tug's wheel makes that fold. Pushes in 15 cm pieces with the bodies grown by `margin` until the nose gear reaches
 * the mark; null if anything is touched, the nose gear folds past its lock less a margin, or it ends off the mark.
 */
export function follow(state: GameState, radius: number): PushPlan | null {
  const path = track(state, radius);
  if (!path) return null;
  const { apron } = state;
  const near = obstacles(apron);
  const h = -AIRLINER.hitch;
  const L = AIRLINER.axle;
  const lock = max_steer(SPEC);
  const limit = STEERING_LIMIT - FOLD_MARGIN;
  let at: Placement = state.car;
  let steer = 0;
  let index = 0;
  const moves: Move[] = [];
  for (let travelled = 0; travelled < 400; travelled += PIECE) {
    const judged = judge(apron, at);
    if (judged.along >= -PIECE / 2) {
      if (!is_done(judged)) return null;
      return { moves, reversals: 0, distance: travelled, radius };
    }
    const pose = aircraft_pose(at);
    const moving = pose.heading + Math.PI;
    let best = Infinity;
    for (let i = index; i < Math.min(path.points.length, index + 40); i++) {
      const d = Math.hypot(pose.x - path.points[i].x, pose.y - path.points[i].y);
      if (d < best) {
        best = d;
        index = i;
      }
    }
    const q = path.points[index];
    const direction = path.directions[index];
    const lateral = Math.cos(direction) * (pose.y - q.y) - Math.sin(direction) * (pose.x - q.x);
    const off = wrap_angle(moving - direction);
    const want = path.curvature[index] - K_LATERAL * lateral - K_HEADING * off;
    const target = fold_for(want);
    const beta = folds(at, SPEC)[0] ?? 0;
    const kappa = (-K_FOLD * (beta - target) - Math.sin(beta) / L) / (1 + (h * Math.cos(beta)) / L);
    const wanted = clamp(Math.atan(kappa * SPEC.wheelbase), -lock, lock);
    steer += clamp(wanted - steer, -lock * STEER_RATE, lock * STEER_RATE);
    const next = drive(at, { steer, distance: PIECE }, SPEC);
    if (Math.abs(folds(next, SPEC)[0] ?? 0) > limit || contact(near, apron, next, MARGIN)) return null;
    const last = moves[moves.length - 1];
    if (last && last.steer === steer) last.distance += PIECE;
    else moves.push({ steer, distance: PIECE });
    at = next;
  }
  return null;
}

/** The shortest push any of the radii manage, or null when none gets there clean. */
export function plan_push(state: GameState): PushPlan | null {
  let found: PushPlan | null = null;
  for (const radius of RADII) {
    const push = follow(state, radius);
    if (push && (!found || push.distance < found.distance)) found = push;
  }
  return found;
}

/** Metres a second a careful pushback averages, setting off and stopping included. */
export const PAR_SPEED = 1.3;
export const PAR_SLACK = 1.25;

export function par_of(found: PushPlan): Par {
  return { ms: Math.ceil(((found.distance / PAR_SPEED) * PAR_SLACK) / 5) * 5000 };
}

const TOW_RADII = [16, 20, 24, 28];

function tow_track(state: GameState, radius: number): Track | null {
  const { apron } = state;
  const start = aircraft_pose(state.car, TOW);
  const c = apron.centreline;
  const gate = apron.stop.x;
  const side = start.x > gate ? 1 : -1;
  const along = side > 0 ? Math.PI : 0;
  const north = -Math.PI / 2;
  if (Math.abs(start.x - gate) < radius * 2 || start.y - radius < c) return null;
  const points: Vec[] = [];
  const directions: number[] = [];
  const curvature: number[] = [];
  const push = (p: Vec, direction: number, kappa: number) => {
    points.push(p);
    directions.push(direction);
    curvature.push(kappa);
  };
  for (let y = start.y; y > c + radius; y -= SAMPLE) push({ x: start.x, y }, north, 0);
  const steps = Math.ceil(((Math.PI / 2) * radius) / SAMPLE);
  const first = { x: start.x - side * radius, y: c + radius };
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * (Math.PI / 2);
    push(
      { x: first.x + side * radius * Math.cos(a), y: first.y - radius * Math.sin(a) },
      north - side * a,
      -side / radius
    );
  }
  for (let x = start.x - side * radius; side * (x - (gate + side * radius)) > 0; x -= side * SAMPLE)
    push({ x, y: c }, along, 0);
  const second = { x: gate + side * radius, y: c - radius };
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * (Math.PI / 2);
    push(
      { x: second.x - side * radius * Math.sin(a), y: second.y + radius * Math.cos(a) },
      along + side * a,
      side / radius
    );
  }
  for (let d = 0; d < RUN_OUT; d += SAMPLE) push({ x: gate, y: c - radius - d }, north, 0);
  return { points, directions, curvature };
}

/**
 * The tug's way that makes the main gear follow `path` exactly: the nose gear runs a wheelbase ahead of the main gear
 * along its tangent, and the tug's heading solves the towbar's equation backwards from the gate, where it's stable.
 */
function tug_track(path: Track): Vec[] {
  const h = TOW.hitches[0].hitch;
  const L = TOW.hitches[0].axle;
  const hinge = path.points.map((p, i) => ({
    x: p.x + Math.cos(path.directions[i]) * L,
    y: p.y + Math.sin(path.directions[i]) * L,
  }));
  const n = hinge.length;
  const heading = new Float64Array(n);
  heading[n - 1] = path.directions[n - 1];
  for (let i = n - 1; i > 0; i--) {
    const ux = Math.cos(heading[i]);
    const uy = Math.sin(heading[i]);
    const dx = hinge[i - 1].x - hinge[i].x;
    const dy = hinge[i - 1].y - hinge[i].y;
    heading[i - 1] = heading[i] - (ux * dy - uy * dx) / h;
  }
  return hinge.map((p, i) => ({ x: p.x + Math.cos(heading[i]) * h, y: p.y + Math.sin(heading[i]) * h }));
}

const TOW_LOOKAHEAD = 2.5;

export function follow_tow(state: GameState, radius: number): PushPlan | null {
  const path = tow_track(state, radius);
  if (!path) return null;
  const way = tug_track(path);
  const { apron } = state;
  const near = obstacles(apron);
  const lock = max_steer(TOW);
  const limit = STEERING_LIMIT - FOLD_MARGIN;
  let at: Placement = state.car;
  let steer = 0;
  let index = 0;
  const moves: Move[] = [];
  const last_turn = way.length - RUN_OUT / SAMPLE;
  for (let travelled = 0; travelled < 600; travelled += PIECE) {
    const judged = judge(apron, at, TOW);
    if (index > last_turn && judged.along >= -PIECE / 2) {
      if (!is_done(judged)) return null;
      return { moves, reversals: 0, distance: travelled, radius };
    }
    let best = Infinity;
    for (let i = index; i < Math.min(way.length, index + 40); i++) {
      const d = Math.hypot(at.x - way[i].x, at.y - way[i].y);
      if (d < best) {
        best = d;
        index = i;
      }
    }
    let target = way[way.length - 1];
    for (let i = index; i < way.length; i++) {
      if (Math.hypot(way[i].x - at.x, way[i].y - at.y) >= TOW_LOOKAHEAD) {
        target = way[i];
        break;
      }
    }
    const alpha = wrap_angle(Math.atan2(target.y - at.y, target.x - at.x) - at.heading);
    const wanted = clamp(Math.atan((2 * TOW.wheelbase * Math.sin(alpha)) / TOW_LOOKAHEAD), -lock, lock);
    steer += clamp(wanted - steer, -lock * STEER_RATE * 2, lock * STEER_RATE * 2);
    const next = drive(at, { steer, distance: PIECE }, TOW);
    if (Math.abs(folds(next, TOW)[0] ?? 0) > limit || contact(near, apron, next, MARGIN, TOW)) return null;
    const last = moves[moves.length - 1];
    if (last && last.steer === steer) last.distance += PIECE;
    else moves.push({ steer, distance: PIECE });
    at = next;
  }
  return null;
}

export function plan_tow(state: GameState): PushPlan | null {
  let found: PushPlan | null = null;
  for (const radius of TOW_RADII) {
    const tow = follow_tow(state, radius);
    if (tow && (!found || tow.distance < found.distance)) found = tow;
  }
  return found;
}

export function plan_bags(state: GameState): TrainRun | null {
  const train = state.apron.train;
  if (!train) return null;
  const near = obstacles(state.scene);
  return run_route(
    state.car,
    train.route,
    train.arrive_from,
    train.mark,
    train.heading,
    (at) => collide(at, near, BAGGAGE) !== null
  );
}

export const BAG_SPEED = 2.2;

function seconds(distance: number, speed: number): number {
  return (distance / speed) * PAR_SLACK;
}

function rounded(seconds: number): Par {
  return { ms: Math.ceil(seconds / 5) * 5000 };
}

export function job_par(state: GameState): Par | null {
  if (state.phase === Phase.TOW) {
    const found = plan_tow(state);
    return found && rounded(seconds(found.distance, PAR_SPEED));
  }
  if (state.phase === Phase.PUSH) {
    const found = plan_push(state);
    return found && par_of(found);
  }
  const bags = plan_bags(state);
  if (!bags) return null;
  if (state.round.job !== Job.TURNAROUND) return rounded(seconds(bags.distance, BAG_SPEED));
  const push = plan_push(swap_to_push(state));
  return push && rounded(seconds(bags.distance, BAG_SPEED) + seconds(push.distance, PAR_SPEED));
}
