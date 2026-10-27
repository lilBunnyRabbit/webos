import { z } from "zod";
import { SHIPS, type Controls, type Point, type ShipDesign, type ShipId } from "./ships";

export { type Point };

export const Status = { READY: "ready", FLYING: "flying", PAUSED: "paused", LANDED: "landed", CRASHED: "crashed" } as const;
export type Status = (typeof Status)[keyof typeof Status];

/** World units, y grows downward like the canvas. */
export const WORLD = { width: 400, height: 250 } as const;

export const Gravity = { ZERO: "zero", MOON: "moon", MARS: "mars", EARTH: "earth" } as const;
export type Gravity = (typeof Gravity)[keyof typeof Gravity];

export const gravity_schema = z.enum(Gravity);

// Real surface gravity in m/s², scaled by one factor so the planets keep their true ratios.
const G_SCALE = 6;
export const GRAVITY: Record<Gravity, { label: string; g: number }> = {
  zero: { label: "Zero-G", g: 0 },
  moon: { label: "Moon", g: 1.62 * G_SCALE },
  mars: { label: "Mars", g: 3.71 * G_SCALE },
  earth: { label: "Earth", g: 9.81 * G_SCALE },
};

export const GRAVITY_OPTIONS = Object.entries(GRAVITY).map(([value, { label }]) => ({ value: value as Gravity, label }));

export interface Environment {
  gravity: Gravity;
  air: boolean;
  /** Only blows through air, so it does nothing while `air` is off. */
  wind: boolean;
  infinite_fuel: boolean;
}

export const DEFAULT_ENVIRONMENT: Environment = { gravity: Gravity.MOON, air: false, wind: false, infinite_fuel: false };

const DRAG = 0.35;

export const SAFE = { vy: 14, vx: 8, angle: 0.22 } as const;

export interface Pad {
  x0: number;
  x1: number;
  y: number;
}

export interface Ship {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Radians, 0 upright, positive leans right (clockwise on screen). */
  angle: number;
  spin: number;
  fuel: number;
}

export interface Touchdown {
  vx: number;
  vy: number;
  angle: number;
  /** Feet centre from pad centre, 0 dead centre, 1 at the pad edge. */
  offset: number;
}

export interface GameState {
  design: ShipDesign;
  env: Environment;
  ship: Ship;
  firing: readonly boolean[];
  terrain: readonly Point[];
  pad: Pad;
  wind_dir: number;
  status: Status;
  reason: string | null;
  touchdown: Touchdown | null;
  time: number;
}

const PAD_CENTRE = 270;
const PAD_Y = 205;

const HILLS: readonly Point[] = [
  { x: 0, y: 190 },
  { x: 30, y: 200 },
  { x: 60, y: 175 },
  { x: 95, y: 215 },
  { x: 130, y: 225 },
  { x: 165, y: 190 },
  { x: 200, y: 160 },
  { x: 225, y: 195 },
  { x: 320, y: 170 },
  { x: 345, y: 140 },
  { x: 375, y: 185 },
  { x: WORLD.width, y: 175 },
];

export function pad_for(design: ShipDesign): Pad {
  const xs = design.feet.map((foot) => foot.x);
  const width = Math.max(40, Math.max(...xs) - Math.min(...xs) + 24);
  return { x0: PAD_CENTRE - width / 2, x1: PAD_CENTRE + width / 2, y: PAD_Y };
}

export function build_terrain(pad: Pad): Point[] {
  const outside = HILLS.filter((point) => point.x < pad.x0 - 8 || point.x > pad.x1 + 8);
  const left = outside.filter((point) => point.x < pad.x0);
  const right = outside.filter((point) => point.x > pad.x1);
  return [...left, { x: pad.x0, y: pad.y }, { x: pad.x1, y: pad.y }, ...right];
}

export function create_game(ship: ShipId, env: Environment = DEFAULT_ENVIRONMENT, rng: () => number = Math.random): GameState {
  const design = SHIPS[ship];
  const pad = pad_for(design);
  return {
    design,
    env,
    ship: { x: 60, y: 40, vx: 12, vy: 0, angle: 0, spin: 0, fuel: 100 },
    firing: design.thrusters.map(() => false),
    terrain: build_terrain(pad),
    pad,
    wind_dir: rng() < 0.5 ? -1 : 1,
    status: Status.READY,
    reason: null,
    touchdown: null,
    time: 0,
  };
}

export function ground_at(terrain: readonly Point[], x: number): number {
  if (x <= terrain[0].x) return terrain[0].y;
  for (let i = 1; i < terrain.length; i++) {
    const a = terrain[i - 1];
    const b = terrain[i];
    if (x <= b.x) return a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x);
  }
  return terrain[terrain.length - 1].y;
}

export function rotate(angle: number, local: Point): Point {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: local.x * cos - local.y * sin, y: local.x * sin + local.y * cos };
}

export function to_world(ship: Ship, local: Point): Point {
  const turned = rotate(ship.angle, local);
  return { x: ship.x + turned.x, y: ship.y + turned.y };
}

export function wind_speed(state: GameState): number {
  if (!state.env.air || !state.env.wind) return 0;
  const t = state.time;
  return state.wind_dir * (10 + 6 * Math.sin(t * 0.5) + 4 * Math.sin(t * 1.7 + 1));
}

export function altitude(state: GameState): number {
  const feet = state.design.feet.map((foot) => to_world(state.ship, foot));
  return Math.max(0, Math.min(...feet.map((foot) => ground_at(state.terrain, foot.x) - foot.y)));
}

export function set_status(state: GameState, status: Status): GameState {
  return { ...state, status, firing: status === Status.FLYING ? state.firing : state.firing.map(() => false) };
}

function inside(polygon: readonly Point[], point: Point): boolean {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if (a.y > point.y !== b.y > point.y && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

function judge(ship: Ship, pad: Pad, feet: readonly Point[]): string | null {
  if (!feet.every((foot) => foot.x >= pad.x0 && foot.x <= pad.x1)) return "Missed the pad";
  if (Math.abs(ship.angle) > SAFE.angle) return "Touched down tilted";
  if (ship.vy > SAFE.vy) return "Came down too fast";
  if (Math.abs(ship.vx) > SAFE.vx) return "Slid in sideways";
  return null;
}

/** One fixed physics step: every firing thruster adds its push and its torque (r × F) about the centre of mass. */
export function step(state: GameState, input: Controls, dt: number): GameState {
  if (state.status !== Status.FLYING) return state;
  const { design, env } = state;
  const ship = { ...state.ship };
  const firing = design.thrusters.map((thruster) => ship.fuel > 0 && thruster.controls.some((control) => input[control]));

  let ax = 0;
  let ay = GRAVITY[env.gravity].g;
  let torque = 0;
  let burn = 0;
  design.thrusters.forEach((thruster, i) => {
    if (!firing[i]) return;
    const fx = thruster.dir.x * thruster.power;
    const fy = thruster.dir.y * thruster.power;
    torque += thruster.at.x * fy - thruster.at.y * fx;
    const world = rotate(ship.angle, { x: fx, y: fy });
    ax += world.x / design.mass;
    ay += world.y / design.mass;
    burn += thruster.burn;
  });
  if (env.air) {
    ax -= (DRAG * (ship.vx - wind_speed(state))) / design.mass;
    ay -= (DRAG * ship.vy) / design.mass;
  }

  if (!env.infinite_fuel) ship.fuel = Math.max(0, ship.fuel - burn * dt);
  ship.spin += (torque / design.inertia) * dt;
  ship.spin *= Math.max(0, 1 - design.spin_damping * dt);
  ship.angle += ship.spin * dt;
  ship.angle = Math.atan2(Math.sin(ship.angle), Math.cos(ship.angle));
  ship.vx += ax * dt;
  ship.vy += ay * dt;
  ship.x += ship.vx * dt;
  ship.y += ship.vy * dt;

  const extent = [...design.hull, ...design.feet, ...design.thrusters.map((thruster) => thruster.at)].map((point) => to_world(ship, point));
  const xs = extent.map((point) => point.x);
  const ys = extent.map((point) => point.y);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  if (left < 0 || right > WORLD.width) {
    ship.x -= left < 0 ? left : right - WORLD.width;
    ship.vx = 0;
  }
  const top = Math.min(...ys);
  if (top < 0) {
    ship.y -= top;
    ship.vy = Math.max(0, ship.vy);
  }

  const next: GameState = { ...state, ship, firing, time: state.time + dt };
  const outline = design.hull.map((point) => to_world(ship, point));
  const feet = design.feet.map((foot) => to_world(ship, foot));
  // Long hulls can straddle a peak with every vertex in the air, so the terrain's own points are tested too.
  const hull_hit =
    outline.some((point) => point.y >= ground_at(state.terrain, point.x)) ||
    state.terrain.some((point) => inside(outline, point));
  const foot_hit = feet.some((foot) => foot.y >= ground_at(state.terrain, foot.x));
  if (!hull_hit && !foot_hit) return next;

  const stopped = firing.map(() => false);
  const reason = hull_hit ? "Hit the ground" : judge(ship, state.pad, feet);
  if (reason) return { ...next, status: Status.CRASHED, reason, firing: stopped };

  const lowest = Math.max(...design.feet.map((foot) => foot.y));
  const local_xs = design.feet.map((foot) => foot.x);
  // Snapping upright moves the feet; slide the ship so they still stand on the pad it was judged on.
  const x = Math.min(state.pad.x1 - Math.max(...local_xs), Math.max(state.pad.x0 - Math.min(...local_xs), ship.x));
  const rest = { ...ship, x, y: state.pad.y - lowest, vx: 0, vy: 0, angle: 0, spin: 0 };
  const centre = feet.reduce((sum, foot) => sum + foot.x, 0) / feet.length;
  const half = (state.pad.x1 - state.pad.x0) / 2;
  const touchdown = { vx: ship.vx, vy: ship.vy, angle: ship.angle, offset: Math.min(1, Math.abs(centre - (state.pad.x0 + half)) / half) };
  return { ...next, ship: rest, status: Status.LANDED, firing: stopped, touchdown };
}

export function fixed_steps(
  accumulator: number,
  elapsed: number,
  step_ms: number,
  max_steps = 8
): { steps: number; remainder: number } {
  const total = accumulator + Math.max(0, elapsed);
  const steps = Math.floor(total / step_ms);
  if (steps > max_steps) return { steps: max_steps, remainder: 0 };
  return { steps, remainder: total - steps * step_ms };
}

export interface Score {
  total: number;
  soft: number;
  level: number;
  centre: number;
  fuel: number;
}

const unit = (value: number, limit: number) => Math.max(0, 1 - Math.abs(value) / limit);

/** Fuel counts only when it can run out, so infinite-fuel runs score on the touchdown alone. */
export function score(state: GameState): Score | null {
  const touchdown = state.touchdown;
  if (state.status !== Status.LANDED || !touchdown) return null;
  const soft = Math.round(400 * unit(touchdown.vy, SAFE.vy) + 100 * unit(touchdown.vx, SAFE.vx));
  const level = Math.round(200 * unit(touchdown.angle, SAFE.angle));
  const centre = Math.round(200 * (1 - touchdown.offset));
  const fuel = state.env.infinite_fuel ? 0 : Math.round(4 * state.ship.fuel);
  return { total: soft + level + centre + fuel, soft, level, centre, fuel };
}

export const best_scores_schema = z.record(z.string(), z.number().int().nonnegative());
export type BestScores = z.infer<typeof best_scores_schema>;

export function mode_key(ship: ShipId, env: Environment): string {
  return [ship, env.gravity, env.air ? "air" : "", env.air && env.wind ? "wind" : "", env.infinite_fuel ? "inf" : ""].filter(Boolean).join("-");
}

/** Ships with a landing on record: every best score is keyed by `mode_key`, which starts with the ship. */
export function ships_landed(best: BestScores): number {
  const keys = Object.keys(best);
  return Object.keys(SHIPS).filter((ship) => keys.some((key) => key === ship || key.startsWith(`${ship}-`))).length;
}

/** Judged on the touchdown alone, so fuel left over neither helps nor hurts. */
export const SOFT_TOUCH = 850;

export function soft_touch(result: Score | null): boolean {
  return result !== null && result.total - result.fuel >= SOFT_TOUCH;
}
