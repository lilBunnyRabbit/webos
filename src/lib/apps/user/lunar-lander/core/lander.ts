import { BODIES, BodyId, BODY_IDS, type Body } from "./bodies";

export const DT = 1 / 120;
export const DEG = Math.PI / 180;

/** Ship frame: `x` to the right of the upright ship, `z` up, metres from the centre of mass. */
export interface BodyPoint {
  x: number;
  z: number;
}

export const Steering = { RCS: "rcs", SPLIT: "split" } as const;
export type Steering = (typeof Steering)[keyof typeof Steering];

/** What a pilot feels; `coefficients()` solves the rest so the ship meets it. */
export interface ShipSpec {
  id: string;
  name: string;
  mass: number;
  gyration: number;
  /** The throttle that holds the empty ship still in the air, per body: the engines are rated for each. */
  hover: Record<BodyId, number>;
  /** °/s the ship turns at with A or D held. */
  spin: number;
  /** Seconds from rest to 90 % of `spin`; a split-thrust ship measured at hover throttle on the Moon. */
  spin_up: number;
  steering: Steering;
  engines: readonly BodyPoint[];
  /** The touchdown limits: closing speed and sideways speed in m/s, tilt in degrees. */
  safe: { sink: number; slide: number; tilt: number };
  /** Seconds of hover in a full tank. */
  tank: number;
  spool: number;
  feet: readonly BodyPoint[];
  /** The legs' stroke: a touchdown at the safe sink on Earth takes all of it. */
  travel: number;
  hull: readonly BodyPoint[];
  drag_area: number;
}

export interface Coefficients {
  spec: ShipSpec;
  mass: number;
  inertia: number;
  thrust: Record<BodyId, number>;
  torque: number;
  split: number;
  arm: number;
  leg_k: number;
  leg_c: number;
}

export interface Env {
  body: Body;
  wind: number;
  ground: (x: number) => number;
  infinite_fuel?: boolean;
}

export interface Input {
  throttle: number;
  /** −1 to 1, positive turns the top to the left (anticlockwise). */
  turn: number;
}

export interface Ship {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Radians anticlockwise from upright. */
  angle: number;
  spin: number;
  spool: number;
  /** Seconds of hover left. */
  fuel: number;
  cargo: number;
  /** The share of the turning authority in use, −1 to 1: RCS puffs or the split between the pods. */
  turning: number;
  on: boolean[];
  /** How far each foot is pressed into the ground. */
  stroke: number[];
}

const RATE_GAIN = 8;
const LEG_DAMPING = 0.5;
const FRICTION = 0.7;
const RCS_BURN = 0.06;
const SETTLE_SPEED = 0.03;

export const VACUUM: Env = { body: BODIES[BodyId.MOON], wind: 0, ground: () => -1e6 };

export function flat(body: Body = BODIES[BodyId.MOON], wind = 0): Env {
  return { body, wind, ground: () => 0 };
}

export function mass_of(ship: Pick<Ship, "cargo">, c: Coefficients): number {
  return c.mass + ship.cargo;
}

export function hover_throttle(ship: Pick<Ship, "cargo">, c: Coefficients, body: Body): number {
  return (mass_of(ship, c) * body.g) / c.thrust[body.id];
}

export function offset(angle: number, p: BodyPoint): { x: number; y: number } {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: p.x * cos - p.z * sin, y: p.x * sin + p.z * cos };
}

export function world_point(ship: Pick<Ship, "x" | "y" | "angle">, p: BodyPoint): { x: number; y: number } {
  const r = offset(ship.angle, p);
  return { x: ship.x + r.x, y: ship.y + r.y };
}

/** The lowest point the legs reach, metres above the ground under each foot. */
export function feet_height(ship: Pick<Ship, "x" | "y" | "angle">, c: Coefficients, env: Env): number {
  let low = Infinity;
  for (const foot of c.spec.feet) {
    const p = world_point(ship, foot);
    low = Math.min(low, p.y - env.ground(p.x));
  }
  return low;
}

export function create_ship(c: Coefficients, x: number, y: number, cargo = 0): Ship {
  return { x, y, vx: 0, vy: 0, angle: 0, spin: 0, spool: 0, fuel: c.spec.tank, cargo, turning: 0, on: c.spec.feet.map(() => false), stroke: c.spec.feet.map(() => 0) };
}

/** Standing on flat ground at `ground`, the legs pressed in by the ship's weight. */
export function parked_ship(c: Coefficients, x: number, ground: number, body: Body, cargo = 0): Ship {
  const ship = create_ship(c, x, 0, cargo);
  const sag = (mass_of(ship, c) * body.g) / (c.leg_k * c.spec.feet.length);
  const low = Math.min(...c.spec.feet.map((f) => f.z));
  return { ...ship, y: ground - low - sag, on: c.spec.feet.map(() => true), stroke: c.spec.feet.map(() => sag) };
}

export function step_ship(ship: Ship, input: Input, c: Coefficients, dt: number, env: Env): Ship {
  const s = c.spec;
  const m = mass_of(ship, c);
  const inertia = (c.inertia * m) / c.mass;
  const fuelled = ship.fuel > 0 || !!env.infinite_fuel;
  const throttle = fuelled ? Math.max(0, Math.min(1, input.throttle)) : 0;
  const spool = ship.spool + (throttle - ship.spool) * (1 - Math.exp(-dt / s.spool));
  const T = spool * c.thrust[env.body.id];

  const turn = Math.max(-1, Math.min(1, input.turn));
  const wanted = inertia * RATE_GAIN * (turn * s.spin * DEG - ship.spin);
  // On its legs a hands-off ship lets the rate hold go: fighting the springs it rocked for ever.
  const holding = Math.abs(turn) > 0.01 || !ship.on.some(Boolean);
  const authority = !fuelled || !holding ? 0 : s.steering === Steering.RCS ? c.torque : c.split * T * c.arm;
  const torque_turn = authority > 0 ? Math.max(-authority, Math.min(authority, wanted)) : 0;
  const turning = authority > 0 ? torque_turn / authority : 0;

  const up_x = -Math.sin(ship.angle);
  const up_y = Math.cos(ship.angle);
  let fx = T * up_x;
  let fy = T * up_y - m * env.body.g;
  let torque = torque_turn;

  if (env.body.rho > 0) {
    const rx = ship.vx - env.wind;
    const ry = ship.vy;
    const k = 0.5 * env.body.rho * Math.hypot(rx, ry) * s.drag_area;
    fx -= k * rx;
    fy -= k * ry;
  }

  const on: boolean[] = [];
  const stroke: number[] = [];
  for (const foot of s.feet) {
    const r = offset(ship.angle, foot);
    const px = ship.x + r.x;
    const py = ship.y + r.y;
    const depth = env.ground(px) - py;
    if (depth <= 0) {
      on.push(false);
      stroke.push(0);
      continue;
    }
    const slope = (env.ground(px + 0.25) - env.ground(px - 0.25)) / 0.5;
    const norm = Math.hypot(1, slope);
    const nx = -slope / norm;
    const ny = 1 / norm;
    const vpx = ship.vx - ship.spin * r.y;
    const vpy = ship.vy + ship.spin * r.x;
    const vn = vpx * nx + vpy * ny;
    const vt = vpx * ny - vpy * nx;
    const normal = Math.max(0, c.leg_k * depth - c.leg_c * vn);
    // Capped at half of what stops the foot's slide in one step, through the mass the foot feels (the ship turns about
    // its centre too): heavy on Earth, the smoothed friction alone is stiff enough to ring from step to step.
    const lever = r.x * nx + r.y * ny;
    const felt = 1 / (1 / m + (lever * lever) / inertia);
    const stop = (0.5 * Math.abs(vt) * felt) / s.feet.length / dt;
    const friction = Math.max(-stop, Math.min(stop, -FRICTION * normal * Math.tanh(vt / 0.05)));
    const cx = normal * nx + friction * ny;
    const cy = normal * ny - friction * nx;
    fx += cx;
    fy += cy;
    torque += r.x * cy - r.y * cx;
    on.push(true);
    stroke.push(depth);
  }

  let vx = ship.vx + (fx / m) * dt;
  let vy = ship.vy + (fy / m) * dt;
  let spin = ship.spin + (torque / inertia) * dt;
  // Springs and tanh friction leave a parked ship creeping for ever; standing on every foot with the engine below its weight, it stops.
  if (on.every(Boolean) && T < m * env.body.g * 0.9 && Math.abs(turn) < 0.01 && Math.hypot(vx, vy) < SETTLE_SPEED && Math.abs(spin) < 0.01) {
    vx = 0;
    vy = 0;
    spin = 0;
  }
  const burn = T / (c.mass * env.body.g) + (s.steering === Steering.RCS ? (Math.abs(torque_turn) / c.torque) * RCS_BURN : 0);
  return {
    x: ship.x + vx * dt,
    y: ship.y + vy * dt,
    vx,
    vy,
    angle: ship.angle + spin * dt,
    spin,
    spool,
    fuel: env.infinite_fuel ? ship.fuel : Math.max(0, ship.fuel - burn * dt),
    cargo: ship.cargo,
    turning,
    on,
    stroke,
  };
}

function hovering(c: Coefficients, body: Body, throttle: number): Ship {
  return { ...create_ship(c, 0, 1000), spool: throttle };
}

/** The throttle at which the empty ship holds its height. */
export function measure_hover(c: Coefficients, body: Body): number {
  const env: Env = { ...VACUUM, body };
  return solve(
    (throttle) => {
      let ship = hovering(c, body, throttle);
      for (let t = 0; t < 4; t += DT) ship = step_ship(ship, { throttle, turn: 0 }, c, DT, env);
      return ship.vy;
    },
    0,
    0,
    1,
    30
  );
}

/** A held turn from rest at hover throttle: the rate it settles at (°/s) and the seconds to 90 % of the spec's. */
export function measure_spin(c: Coefficients, body: Body = BODIES[BodyId.MOON]): { peak: number; rise: number } {
  const env: Env = { ...VACUUM, body };
  const throttle = hover_throttle({ cargo: 0 }, c, body);
  let ship = hovering(c, body, throttle);
  let rise = Infinity;
  let peak = 0;
  for (let t = 0; t < 8; t += DT) {
    ship = step_ship(ship, { throttle, turn: 1 }, c, DT, env);
    peak = Math.max(peak, ship.spin / DEG);
    if (rise === Infinity && ship.spin / DEG >= 0.9 * c.spec.spin) rise = t + DT;
  }
  return { peak, rise };
}

/** Upright onto flat ground at `sink` m/s, engine off: the deepest stroke, the peak load in g and whether the hull touched. */
export function measure_drop(c: Coefficients, body: Body, sink: number): { stroke: number; peak_g: number; hull: boolean } {
  const env = flat(body);
  const low = Math.min(...c.spec.feet.map((f) => f.z));
  let ship: Ship = { ...create_ship(c, 0, -low + 0.001), vy: -sink };
  let stroke = 0;
  let peak = 0;
  let hull = false;
  for (let t = 0; t < 3; t += DT) {
    const before = ship.vy;
    ship = step_ship(ship, { throttle: 0, turn: 0 }, c, DT, env);
    stroke = Math.max(stroke, ...ship.stroke);
    peak = Math.max(peak, (ship.vy - before) / DT / body.g + 1);
    if (c.spec.hull.some((p) => world_point(ship, p).y < 0)) hull = true;
  }
  return { stroke, peak_g: peak, hull };
}

/** Seconds a full tank holds the empty ship in a hover. */
export function measure_tank(c: Coefficients, body: Body): number {
  const env: Env = { ...VACUUM, body };
  const throttle = hover_throttle({ cargo: 0 }, c, body);
  let ship = hovering(c, body, throttle);
  let t = 0;
  while (ship.fuel > 0 && t < 3600) {
    ship = step_ship(ship, { throttle, turn: 0 }, c, DT, env);
    t += DT;
  }
  return t;
}

function solve(measure: (x: number) => number, target: number, lo: number, hi: number, rounds = 40): number {
  for (let i = 0; i < rounds; i++) {
    const mid = (lo + hi) / 2;
    if (measure(mid) < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export function coefficients(spec: ShipSpec): Coefficients {
  const thrust = Object.fromEntries(BODY_IDS.map((id) => [id, (spec.mass * BODIES[id].g) / spec.hover[id]])) as Record<BodyId, number>;
  const inertia = spec.mass * spec.gyration ** 2;
  const c: Coefficients = {
    spec,
    mass: spec.mass,
    inertia,
    thrust,
    torque: 0,
    split: 0,
    arm: Math.max(...spec.engines.map((e) => Math.abs(e.x))),
    leg_k: spec.mass * 400,
    leg_c: 0,
  };
  const legs = (k: number): Pick<Coefficients, "leg_k" | "leg_c"> => ({ leg_k: k, leg_c: 2 * LEG_DAMPING * Math.sqrt((k * spec.mass) / spec.feet.length) });
  Object.assign(c, legs(c.leg_k));
  if (spec.steering === Steering.RCS) c.torque = solve((torque) => -measure_spin({ ...c, torque }).rise, -spec.spin_up, inertia * 0.01, inertia * 40, 36);
  else c.split = solve((split) => -measure_spin({ ...c, split }).rise, -spec.spin_up, 0, 1, 36);
  const earth = BODIES[BodyId.EARTH];
  Object.assign(c, legs(solve((k) => -measure_drop({ ...c, ...legs(k) }, earth, spec.safe.sink).stroke, -spec.travel, spec.mass, spec.mass * 5000, 40)));
  return c;
}
