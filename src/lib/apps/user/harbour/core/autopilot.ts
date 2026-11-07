import { inside_convex } from "$kit/games/play2d/collision";
import { wrap_angle, type Pose, type Vec } from "$kit/games/play2d/geometry";
import { body_velocity, create_boat, speed, step_boat, type Boat, type Coefficients, type Input } from "./boat";
import { DETENTS } from "./lever";
import { clear_at, plan } from "./planner";
import { advance, create_game, set_status, Status, type GameState } from "./round";
import { BerthKind, type Berth, type Scene } from "./world";

export const PROOF_DT = 1 / 120;
const TIME_LIMIT = 240;
const LEVER_EVERY = 0.25;
const SLOW = DETENTS[4];
const FENDERS = 0.15;
const ANGLES = [35, 45, 25].map((degrees) => (degrees * Math.PI) / 180);
/** The planner's turns are this much wider than the boat's steady turn, for pure pursuit's lag. */
const RADIUS_ROOM = 1.15;
/** A box berth's straight run in, in lengths from where the hull comes to rest. */
const BOX_LEAD = 1.5;
const SQUARE = (1.5 * Math.PI) / 180;

export interface Proof {
  ok: boolean;
  reason?: string;
  /** Seconds the autopilot took to dock: the level's par before slack. */
  time?: number;
  path?: Pose[];
}

interface Target {
  approach: Pose;
  /** Where the hull would lie docked, a fender's width off everything, for the room check. */
  room: Pose;
  /** The last leg, from the approach to where the hull should come to rest; its first `straight` points run straight. */
  run: Vec[];
  straight: number;
  /** A boat with thrusters alongside stops abeam of its berth at the end of the run, then crabs sideways to here. */
  crab?: Pose;
}

function along(pose: Pose, distance: number, side = 0): Pose {
  const cos = Math.cos(pose.heading);
  const sin = Math.sin(pose.heading);
  return { x: pose.x + cos * distance - sin * side, y: pose.y + sin * distance + cos * side, heading: pose.heading };
}

function leg(from: Vec, to: Vec): Vec[] {
  const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 0.5));
  return Array.from({ length: steps + 1 }, (_, i) => ({ x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps }));
}

function targets(berth: Berth, c: Coefficients): Target[] {
  const { length, beam } = c.spec;
  if (berth.kind === BerthKind.BOX) {
    const [a, b] = berth.bay.shape;
    const head = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, heading: berth.bay.heading };
    const rest = along(head, -length / 2 - 0.15);
    const approach = along(rest, -length * BOX_LEAD);
    const run = leg(approach, rest);
    return [{ approach, room: along(rest, -0.1), run, straight: run.length - Math.ceil(length / 0.5) }];
  }
  const { a, b, out } = berth.edge!;
  const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const ways = [Math.atan2(b.y - a.y, b.x - a.x), Math.atan2(a.y - b.y, a.x - b.x)];
  const shift = (pose: Pose, side: number): Pose => ({ ...pose, x: pose.x + out.x * side, y: pose.y + out.y * side });
  if (c.thruster > 0) {
    // Parallel to the berth a beam and a bit off, clear of the neighbours, then sideways on the thrusters.
    return ways.map((heading) => {
      const rest = { x: middle.x + out.x * (beam / 2 - 0.05), y: middle.y + out.y * (beam / 2 - 0.05), heading };
      const abeam = shift(rest, beam + 8);
      const approach = along(abeam, -length * 1.4);
      const run = leg(approach, abeam);
      return { approach, room: shift(rest, FENDERS + 0.1), run, straight: run.length, crab: rest };
    });
  }
  // In at an angle over the neighbours, then turned parallel late, so the boat ends square to the pontoon.
  const radius = turn_radius(c);
  return ways.flatMap((heading) =>
    ANGLES.map((angle) => {
      const rest = { x: middle.x + out.x * (beam / 2 - 0.05), y: middle.y + out.y * (beam / 2 - 0.05), heading };
      const turn = shift(along(rest, -radius * Math.sin(angle) - length * 0.1), radius * (1 - Math.cos(angle)));
      const reach = length * 1.4;
      const back = shift(along(turn, -reach * Math.cos(angle)), reach * Math.sin(angle));
      const approach = { ...back, heading: Math.atan2(turn.y - back.y, turn.x - back.x) };
      const straight = leg(approach, turn);
      return { approach, room: shift(rest, FENDERS + 0.1), run: [...straight, ...leg(turn, rest).slice(1)], straight: straight.length };
    })
  );
}

/** Whether the hull clears everything down the straight leg of a run, where the planner doesn't look. */
function run_clear(target: Target, scene: Scene, c: Coefficients): boolean {
  const { length, beam } = c.spec;
  const edge = scene.berth?.edge;
  const inside = edge && { x: (edge.a.x + edge.b.x) / 2 - edge.out.x * 0.1, y: (edge.a.y + edge.b.y) / 2 - edge.out.y * 0.1 };
  const others = inside ? scene.solids.filter((solid) => !inside_convex(inside, solid.shape)) : scene.solids;
  for (let i = 0; i < target.straight; i++) {
    const p = target.run[i];
    if (!clear_at({ ...p, heading: target.approach.heading }, others, scene.bounds, { length, beam, margin: 0.1 })) return false;
  }
  return true;
}

const radii = new WeakMap<Coefficients, number>();

/** The boat's steady turn at slow ahead with full wheel, metres; a boat with thrusters turns with them pushing too. */
export function turn_radius(c: Coefficients): number {
  let radius = radii.get(c);
  if (radius === undefined) {
    const assist = c.thruster > 0 ? 1 : 0;
    let boat: Boat = { ...create_boat({ x: 0, y: 0, heading: 0 }), gear: 1, power: SLOW, rudder: 1 };
    for (let t = 0; t < 120; t += PROOF_DT) boat = step_boat(boat, { lever: SLOW, wheel: 1, bow: assist, stern: -assist }, c, PROOF_DT);
    radius = speed(boat) / Math.max(1e-3, Math.abs(boat.r));
    radii.set(c, radius);
  }
  return radius;
}

export function plan_radius(c: Coefficients): number {
  return turn_radius(c) * RADIUS_ROOM;
}

interface Track {
  points: Vec[];
  at: number[];
  total: number;
}

function track(points: Vec[]): Track {
  const at = [0];
  for (let i = 1; i < points.length; i++) at.push(at[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  return { points, at, total: at[at.length - 1] };
}

function point_at(t: Track, s: number): Vec {
  if (s >= t.total) {
    const n = t.points.length;
    const a = t.points[n - 2];
    const b = t.points[n - 1];
    const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: b.x + ((b.x - a.x) / d) * (s - t.total), y: b.y + ((b.y - a.y) / d) * (s - t.total) };
  }
  let i = 1;
  while (i < t.at.length - 1 && t.at[i] < s) i++;
  const a = t.points[i - 1];
  const b = t.points[i];
  const span = t.at[i] - t.at[i - 1] || 1;
  const k = (s - t.at[i - 1]) / span;
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
}

function quantize(value: number): number {
  let best = 0;
  for (const detent of DETENTS) if (Math.abs(detent - value) < Math.abs(best - value)) best = detent;
  return best;
}

function clamp_unit(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

/** A world vector's share to starboard of the boat. */
function starboard(boat: Boat, v: Vec): number {
  return -v.x * Math.sin(boat.heading) + v.y * Math.cos(boat.heading);
}

/** Thrusters holding a heading and pushing the hull sideways at `side` (−1 port to 1 starboard): bow and stern shares. */
function thrusters(boat: Boat, heading: number, side: number): Pick<Input, "bow" | "stern"> {
  const turn = clamp_unit(8 * wrap_angle(heading - boat.heading) - 60 * boat.r);
  return { bow: clamp_unit(side + turn), stern: clamp_unit(side - turn) };
}

/**
 * Steers the real physics along a path: pure pursuit for the wheel, a stopping-distance speed profile on the lever's
 * detents. A boat with thrusters also uses them: turning with the wheel, holding the track near the end, and crabbing
 * the last stretch sideways onto an alongside berth.
 */
export function sail(scene: Scene, c: Coefficients, path: Vec[], axis: number | null, crab: Pose | null = null): GameState {
  const t = track(path);
  const { length, top_speed, thrust } = c.spec;
  const cruise = Math.min(1.1, top_speed * 0.4);
  const brake = Math.min(0.03, (0.5 * c.thrust_astern) / c.mx);
  const near = Math.min(c.thruster > 0 ? 0.5 : 0.85, 0.2 + 0.065 * length);
  const limit = TIME_LIMIT * Math.max(1, length / 10);
  const has_thrusters = c.thruster > 0;
  const end = path[path.length - 1];
  let state = set_status(create_game(scene), Status.SAILING);
  let progress = 0;
  let lever = 0;
  let next_lever = 0;
  let crabbing = false;
  while ((state.status === Status.SAILING || state.status === Status.LINES) && state.time < limit) {
    const boat = state.boat;
    let best = progress;
    let best_distance = Infinity;
    for (let s = progress; s <= Math.min(t.total, progress + 6); s += 0.25) {
      const p = point_at(t, s);
      const d = Math.hypot(p.x - boat.x, p.y - boat.y);
      if (d < best_distance) {
        best_distance = d;
        best = s;
      }
    }
    progress = best;
    const remaining = t.total - progress;
    const u = body_velocity(boat).u;
    if (crab && !crabbing && remaining < 1.5 && speed(boat) < 0.2) crabbing = true;
    if (crabbing && crab) {
      const out = { x: end.x - crab.x, y: end.y - crab.y };
      const out_length = Math.hypot(out.x, out.y) || 1;
      const unit = { x: out.x / out_length, y: out.y / out_length };
      const off = (boat.x - crab.x) * unit.x + (boat.y - crab.y) * unit.y;
      const closing = -(boat.vx * unit.x + boat.vy * unit.y);
      const want = Math.max(0.04, Math.min(0.4, 0.08 * off));
      const into = starboard(boat, { x: -unit.x, y: -unit.y }) > 0 ? 1 : -1;
      const push = off < 0.02 ? 0.3 : clamp_unit((want - closing) * 10);
      const ahead = (crab.x - boat.x) * Math.cos(crab.heading) + (crab.y - boat.y) * Math.sin(crab.heading);
      if (state.time >= next_lever) {
        next_lever = state.time + LEVER_EVERY;
        lever = Math.abs(ahead) < 1 && Math.abs(u) < 0.05 ? 0 : quantize(0.15 * ahead - 2 * u);
      }
      state = advance(state, { lever, wheel: 0, ...thrusters(boat, crab.heading, into * push) }, c, PROOF_DT);
      continue;
    }
    const look = Math.max(0.5 * length, Math.min(1.4 * length, 0.5 * length + 2 * Math.abs(u)));
    const aim = point_at(t, progress + look);
    const wanted = Math.atan2(aim.y - boat.y, aim.x - boat.x);
    const error = wrap_angle(wanted - boat.heading);
    let wheel = Math.max(-1, Math.min(1, 3 * error - 1.5 * boat.r * (u < 0 ? -1 : 1)));
    const off = axis === null ? 0 : wrap_angle(axis - boat.heading);
    const squaring = !has_thrusters && axis !== null && remaining < length * 0.5 && speed(boat) < 0.15 && Math.abs(off) > SQUARE;
    // Stopped at an angle the rudder has no flow: kicks of slow ahead against full rudder swing the stern in.
    if (squaring) wheel = Math.sign(off);
    let assist: Pick<Input, "bow" | "stern"> = {};
    if (has_thrusters) {
      if (remaining < 2 * length) {
        // The last leg runs straight down the berth's axis: hold that line, not the planner's curve the progress may lag on.
        const next = point_at(t, progress + 1);
        const here = axis === null ? point_at(t, progress) : end;
        const tangent = axis ?? Math.atan2(next.y - here.y, next.x - here.x);
        const normal = { x: -Math.sin(tangent), y: Math.cos(tangent) };
        const across = (boat.x - here.x) * normal.x + (boat.y - here.y) * normal.y;
        const drift = boat.vx * normal.x + boat.vy * normal.y;
        assist = thrusters(boat, tangent, clamp_unit(-0.4 * across - 4 * drift));
      } else assist = { bow: wheel, stern: -wheel };
    }
    if (state.time >= next_lever) {
      next_lever = state.time + LEVER_EVERY;
      if (squaring) lever = u < 0.06 ? SLOW : 0;
      else {
        const target = remaining < 0.3 ? 0 : Math.min(cruise, Math.max(0.18, Math.sqrt(2 * brake * remaining)), remaining < length * 2.5 ? near : Infinity);
        const drag = (c.xu * target + c.xuu * target * target) / thrust;
        const wish = drag + (target - u) * 1.5;
        lever = remaining < 0.3 && Math.abs(u) < 0.08 ? 0 : quantize(wish);
      }
    }
    state = advance(state, { lever, wheel, ...assist }, c, PROOF_DT);
  }
  return state;
}

/**
 * A level's proof: the berth is wider than the beam and the fenders, the planner finds a way in with the boat's turning
 * circle, and the autopilot docks the real physics along it without a hard touch. Its time is the level's par.
 */
export function prove(scene: Scene, c: Coefficients): Proof {
  const berth = scene.berth;
  if (!berth) return { ok: false, reason: "no berth" };
  const { length, beam } = c.spec;
  if (berth.kind === BerthKind.BOX) {
    const [a, b] = berth.bay.shape;
    if (Math.hypot(b.x - a.x, b.y - a.y) < beam + FENDERS * 2 + 0.1) return { ok: false, reason: "berth narrower than the beam and fenders" };
  }
  const water = scene.bounds;
  const free = targets(berth, c).some((target) => clear_at(target.room, scene.solids, water, { length, beam, margin: FENDERS }));
  if (!free) return { ok: false, reason: "no room in the berth for the hull and its fenders" };
  const radius = plan_radius(c);
  let last: Proof = { ok: false, reason: "no path in" };
  const options = targets(berth, c).filter((target) => run_clear(target, scene, c)).map((target) => {
    const path = plan(scene.start, target.approach, scene.solids, water, { radius, length, beam, margin: Math.max(0.3, beam * 0.15, length * 0.05), reach: Math.max(1.2, radius * 0.15), tolerance: (12 * Math.PI) / 180, max_expansions: Math.round(40000 * Math.max(1, length / 10)) });
    return { target, path };
  });
  options.sort((x, y) => (x.path?.length ?? Infinity) - (y.path?.length ?? Infinity));
  for (const { target, path } of options) {
    if (!path) continue;
    const line = [...path.map((p) => ({ x: p.x, y: p.y })), ...target.run];
    const state = sail(scene, c, line, target.room.heading, target.crab ?? null);
    if (state.status === Status.DONE) return { ok: true, time: state.time, path };
    last = { ok: false, reason: state.status === Status.CRASHED ? `hard touch at ${state.crash?.speed.toFixed(2)} m/s` : `not docked after ${Math.round(state.time)} s`, path };
  }
  return last;
}

/** Par in ms from the autopilot's time: room for a person who isn't a computer. */
export function par_of(seconds: number): number {
  return Math.ceil(seconds * 1.4 + 8) * 1000;
}
