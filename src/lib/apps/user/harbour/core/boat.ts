import type { Polygon, Pose, Vec } from "$kit/games/play2d/geometry";

export const Drive = { OUTBOARD: "outboard", SHAFT: "shaft" } as const;
export type Drive = (typeof Drive)[keyof typeof Drive];

/**
 * A boat in what a helm feels, not in force constants: `coefficients` derives those so the boat meets these numbers.
 * Metres, kilograms, seconds; speeds in m/s, turn rates in degrees a second.
 */
export interface BoatSpec {
  id: string;
  name: string;
  length: number;
  beam: number;
  mass: number;
  drive: Drive;
  /** Steady speed at full ahead and at full astern. */
  top_speed: number;
  astern_speed: number;
  /** Full-ahead thrust, newtons. */
  thrust: number;
  /** Metres coasted from 1 m/s down to 0.1 m/s with the engine in neutral. */
  carry: number;
  /** Sideways drag over forward drag: a keel's grip on the water. */
  grip: number;
  /** Steady turn at 1 m/s with full rudder and no thrust. */
  turn_rate: number;
  /** Turn rate after 1 s of full ahead from rest with full rudder. */
  kick: number;
  /** Metres the stern walks sideways in 3 s of full astern from rest, wheel straight. */
  walk: number;
  /** Seconds the engine takes to answer the lever (a time constant). */
  engine_lag: number;
  /** Seconds in neutral on the way from ahead to astern or back. */
  gear_time: number;
  /** Seconds from full lock to full lock. */
  rudder_time: number;
  /** The rudder's or the outboard leg's full lock, degrees. */
  lock: number;
  /** Added mass, as shares of `mass`: forward, sideways, and of the turning inertia. */
  added: { surge: number; sway: number; yaw: number };
  /** Bow and stern thrusters: steady turn at rest with both pushing opposite ways, and their spool-up time constant. */
  thrusters?: { turn: number; lag: number };
  /** Drawn as a coaster: square stern, hatches, the bridge aft. */
  cargo?: boolean;
}

export interface Coefficients {
  spec: BoatSpec;
  mx: number;
  my: number;
  iz: number;
  xu: number;
  xuu: number;
  yv: number;
  yvv: number;
  /** Yaw damping on top of what the keel gives; for an outboard, solved for its `kick`. */
  nr: number;
  /** Keel points fore and aft of the middle, metres. */
  keel: readonly [number, number];
  thrust_ahead: number;
  thrust_astern: number;
  /** Radians: the rudder's lock, or how far an outboard's thrust turns. */
  lock: number;
  /** Rudder (or the outboard leg) side force per (m/s)² at full lock, and where it acts. */
  rudder: number;
  rudder_x: number;
  prop_x: number;
  /** The prop's wash over the rudder at full ahead, (m/s)². */
  wash: number;
  /** Prop walk as a share of the thrust astern. */
  walk: number;
  /** Each thruster's full side force, newtons (0 without), and where they sit fore and aft of the middle. */
  thruster: number;
  thruster_x: number;
}

export interface Input {
  /** −1 full astern to 1 full ahead. */
  lever: number;
  /** −1 full port to 1 full starboard. */
  wheel: number;
  /** Thrusters, −1 pushing that end to port to 1 to starboard; boats without them ignore it. */
  bow?: number;
  stern?: number;
}

export interface Boat {
  x: number;
  y: number;
  heading: number;
  /** World velocity, m/s. */
  vx: number;
  vy: number;
  /** Radians a second, clockwise on screen (to starboard). */
  r: number;
  /** −1, 0 or 1: the gear engaged. */
  gear: number;
  /** 0 to 1, the engine's answer to the lever. */
  power: number;
  /** Seconds left in neutral before the next gear goes in. */
  shifting: number;
  /** −1 to 1, the rudder's actual angle as a share of lock. */
  rudder: number;
  /** −1 to 1, the thrusters' spooled-up push. */
  bow: number;
  stern: number;
}

/** A push on the hull from outside (a fender, a wall), world frame. */
export interface Push {
  fx: number;
  fy: number;
  /** Torque, clockwise positive. */
  n: number;
}

export const NO_PUSH: Push = { fx: 0, fy: 0, n: 0 };

const REST_SPEED = 0.02;
const REST_TURN = (0.5 * Math.PI) / 180;
const SETTLE_SPEED = 0.15;
const SETTLE_RATE = 0.35;
const ASTERN_RUDDER = 0.5;
const WALK_FADE = 1.2;
const WALK_AHEAD = 0.03;
const KEEL_AT = 0.3;
const KEEL_LEAD = 0.15;
const QUADRATIC_MIN = 0.05;
const STEER_LINEAR = 0.35;
const THRUSTER_FULL = 1;
const THRUSTER_GONE = 2.6;

export function create_boat(pose: Pose): Boat {
  return { x: pose.x, y: pose.y, heading: pose.heading, vx: 0, vy: 0, r: 0, gear: 0, power: 0, shifting: 0, rudder: 0, bow: 0, stern: 0 };
}

export function speed(boat: Boat): number {
  return Math.hypot(boat.vx, boat.vy);
}

/** Surge (forward) and sway (to starboard) speeds. */
export function body_velocity(boat: Boat): { u: number; v: number } {
  const cos = Math.cos(boat.heading);
  const sin = Math.sin(boat.heading);
  return { u: boat.vx * cos + boat.vy * sin, v: -boat.vx * sin + boat.vy * cos };
}

export function to_world(boat: Pose, local: Vec): Vec {
  const cos = Math.cos(boat.heading);
  const sin = Math.sin(boat.heading);
  return { x: boat.x + local.x * cos - local.y * sin, y: boat.y + local.x * sin + local.y * cos };
}

/** Velocity of a world point fixed to the hull. */
export function point_velocity(boat: Boat, at: Vec): Vec {
  return { x: boat.vx - boat.r * (at.y - boat.y), y: boat.vy + boat.r * (at.x - boat.x) };
}

/** The hull outline in the body frame (x forward, y to starboard), convex so SAT can test it. */
export type HullSize = Pick<BoatSpec, "length" | "beam" | "drive" | "cargo">;

export function hull_shape(spec: HullSize): Vec[] {
  const l = spec.length / 2;
  const b = spec.beam / 2;
  if (spec.cargo) {
    return [
      { x: l, y: 0 },
      { x: l * 0.86, y: b * 0.8 },
      { x: l * 0.66, y: b },
      { x: -l * 0.92, y: b },
      { x: -l, y: b * 0.86 },
      { x: -l, y: -b * 0.86 },
      { x: -l * 0.92, y: -b },
      { x: l * 0.66, y: -b },
      { x: l * 0.86, y: -b * 0.8 },
    ];
  }
  if (spec.drive === Drive.OUTBOARD) {
    return [
      { x: l, y: 0 },
      { x: l * 0.78, y: b * 0.72 },
      { x: l * 0.4, y: b },
      { x: -l, y: b * 0.96 },
      { x: -l, y: -b * 0.96 },
      { x: l * 0.4, y: -b },
      { x: l * 0.78, y: -b * 0.72 },
    ];
  }
  return [
    { x: l, y: 0 },
    { x: l * 0.72, y: b * 0.7 },
    { x: l * 0.36, y: b },
    { x: -l * 0.7, y: b * 0.97 },
    { x: -l, y: b * 0.88 },
    { x: -l, y: -b * 0.88 },
    { x: -l * 0.7, y: -b * 0.97 },
    { x: l * 0.36, y: -b },
    { x: l * 0.72, y: -b * 0.7 },
  ];
}

export function hull(boat: Pose, spec: HullSize): Polygon {
  return hull_shape(spec).map((p) => to_world(boat, p));
}

function clamp_unit(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

/** A tunnel thruster's grip: full up to about 2 kn, gone by 5 kn as the flow past the hull sweeps its jet away. */
export function thruster_fade(u: number): number {
  return Math.max(0, Math.min(1, 1 - (Math.abs(u) - THRUSTER_FULL) / (THRUSTER_GONE - THRUSTER_FULL)));
}

function approach(value: number, target: number, step: number): number {
  return value < target ? Math.min(target, value + step) : Math.max(target, value - step);
}

/** The gearbox and engine: the gear goes in after a pause in neutral, then the power follows the lever with a lag. */
function drive_train(boat: Boat, lever: number, c: Coefficients, dt: number): Pick<Boat, "gear" | "power" | "shifting"> {
  const want = lever > 1e-6 ? 1 : lever < -1e-6 ? -1 : 0;
  let { gear, power, shifting } = boat;
  if (gear !== 0 && want !== gear) {
    gear = 0;
    shifting = want === 0 ? 0 : c.spec.gear_time;
  } else if (gear === 0 && want !== 0) {
    shifting = Math.max(0, shifting - dt);
    if (shifting === 0) gear = want;
  } else if (want === 0) shifting = 0;
  const target = gear === 0 ? 0 : Math.abs(lever);
  power += (target - power) * (1 - Math.exp(-dt / c.spec.engine_lag));
  return { gear, power, shifting };
}

/**
 * The rudder's or the leg's angle, radians, for a wheel share: progressive, so the first turns of the wheel bend the
 * course gently and the last ones bring the full lock in. Quadratic cross-flow damping would otherwise make a tenth of
 * the wheel turn nearly a sixth as tight as full lock.
 */
export function steer_angle(rudder: number, c: Pick<Coefficients, "lock">): number {
  return rudder * (STEER_LINEAR + (1 - STEER_LINEAR) * Math.abs(rudder)) * c.lock;
}

/** One step of semi-implicit Euler: forces in the body frame on the water-relative velocity, velocity first, then pose. */
export function step_boat(boat: Boat, input: Input, c: Coefficients, dt: number, push: Push = NO_PUSH): Boat {
  const { spec } = c;
  const train = drive_train(boat, input.lever, c, dt);
  const rudder = approach(boat.rudder, Math.max(-1, Math.min(1, input.wheel)), (2 / spec.rudder_time) * dt);
  const { u, v } = body_velocity(boat);
  const r = boat.r;
  const thrust = train.gear * train.power * (train.gear > 0 ? c.thrust_ahead : c.thrust_astern);
  const lock = steer_angle(rudder, c);

  let fx = -(c.xu * u + c.xuu * u * Math.abs(u));
  let fy = 0;
  let n = -c.nr * r;
  // The water grips the leading end harder, so the pivot point moves forward going ahead and aft going astern.
  const lead = KEEL_LEAD * Math.tanh(u / 0.3);
  for (const x of c.keel) {
    const vi = v + r * x;
    const yi = -(0.5 + Math.sign(x) * lead) * (c.yv * vi + c.yvv * vi * Math.abs(vi));
    fy += yi;
    n += yi * x;
  }

  if (spec.drive === Drive.OUTBOARD) {
    fx += thrust * Math.cos(lock);
    const side = -thrust * Math.sin(lock);
    fy += side;
    n += side * c.prop_x;
  } else fx += thrust;

  const flow = u * Math.abs(u) * (u < 0 ? ASTERN_RUDDER : 1) + (thrust > 0 ? c.wash * (thrust / c.thrust_ahead) : 0);
  const rudder_side = -c.rudder * Math.sin(lock) * flow;
  fy += rudder_side;
  n += rudder_side * c.rudder_x;
  fx -= c.rudder * 0.25 * Math.sin(lock) ** 2 * flow;

  if (c.walk > 0) {
    const fade = Math.max(0, 1 - Math.abs(u) / WALK_FADE);
    const walk = (thrust < 0 ? -c.walk * -thrust : WALK_AHEAD * c.walk * thrust) * fade;
    fy += walk;
    n += walk * c.prop_x;
  }

  let bow = 0;
  let stern = 0;
  if (c.thruster > 0) {
    const spool = 1 - Math.exp(-dt / spec.thrusters!.lag);
    bow = boat.bow + (clamp_unit(input.bow ?? 0) - boat.bow) * spool;
    stern = boat.stern + (clamp_unit(input.stern ?? 0) - boat.stern) * spool;
    const fade = thruster_fade(u);
    fy += (bow + stern) * c.thruster * fade;
    n += (bow - stern) * c.thruster * fade * c.thruster_x;
  }

  const cos = Math.cos(boat.heading);
  const sin = Math.sin(boat.heading);
  fx += push.fx * cos + push.fy * sin;
  fy += -push.fx * sin + push.fy * cos;
  n += push.n;
  const ax = fx / c.mx;
  const ay = fy / c.my;
  let vx = boat.vx + (ax * cos - ay * sin) * dt;
  let vy = boat.vy + (ax * sin + ay * cos) * dt;
  let turn = r + (n / c.iz) * dt;
  // Linear drag alone leaves a boat creeping for a minute, and "stopped" never comes: below a walking pace it settles fast.
  if (train.power < 0.01 && Math.abs(bow) + Math.abs(stern) < 0.01 && Math.hypot(vx, vy) < SETTLE_SPEED) {
    const settle = Math.exp(-SETTLE_RATE * dt);
    vx *= settle;
    vy *= settle;
    turn *= settle;
    if (push.fx === 0 && push.fy === 0 && Math.hypot(vx, vy) < REST_SPEED && Math.abs(turn) < REST_TURN) {
      vx = 0;
      vy = 0;
      turn = 0;
    }
  }
  return {
    x: boat.x + vx * dt,
    y: boat.y + vy * dt,
    heading: boat.heading + turn * dt,
    vx,
    vy,
    r: turn,
    rudder,
    bow,
    stern,
    ...train,
  };
}

const DT = 1 / 120;

function base(spec: BoatSpec): Coefficients {
  const mx = spec.mass * (1 + spec.added.surge);
  return {
    spec,
    mx,
    my: spec.mass * (1 + spec.added.sway),
    iz: spec.mass * (0.25 * spec.length) ** 2 * (1 + spec.added.yaw),
    xu: 0,
    xuu: 0,
    yv: 0,
    yvv: 0,
    nr: 0,
    keel: [KEEL_AT * spec.length, -KEEL_AT * spec.length],
    lock: (spec.lock * Math.PI) / 180,
    thrust_ahead: spec.thrust,
    thrust_astern: 0,
    rudder: 0,
    rudder_x: -0.45 * spec.length,
    prop_x: -0.45 * spec.length,
    wash: 0,
    walk: 0,
    thruster: 0,
    thruster_x: 0.45 * spec.length,
  };
}

/** Bisection on a measure that grows with `x`. */
function solve(measure: (x: number) => number, target: number, lo: number, hi: number, rounds = 40): number {
  for (let i = 0; i < rounds; i++) {
    const mid = (lo + hi) / 2;
    if (measure(mid) < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function run(c: Coefficients, start: Boat, seconds: number, input: Input, each?: (boat: Boat) => Boat): Boat {
  let boat = start;
  for (let t = 0; t < seconds - 1e-9; t += DT) {
    boat = step_boat(boat, input, c, DT);
    if (each) boat = each(boat);
  }
  return boat;
}

const AT_REST = create_boat({ x: 0, y: 0, heading: 0 });

/** Steady turn, degrees a second, at 1 m/s held with full rudder. */
export function measure_turn(c: Coefficients): number {
  const hold = (boat: Boat): Boat => {
    const { v } = body_velocity(boat);
    const cos = Math.cos(boat.heading);
    const sin = Math.sin(boat.heading);
    return { ...boat, vx: cos - v * sin, vy: sin + v * cos };
  };
  const end = run(c, { ...hold(AT_REST), rudder: 1 }, 12, { lever: 0, wheel: 1 }, hold);
  return (end.r * 180) / Math.PI;
}

export function measure_kick(c: Coefficients): number {
  const end = run(c, { ...AT_REST, gear: 1, power: 1, rudder: 1 }, 1, { lever: 1, wheel: 1 });
  return (end.r * 180) / Math.PI;
}

export function measure_walk(c: Coefficients): number {
  const end = run(c, { ...AT_REST, gear: -1, power: 1 }, 3, { lever: -1, wheel: 0 });
  return -to_world(end, { x: -c.spec.length / 2, y: 0 }).y;
}

export function measure_top(c: Coefficients, lever: number): number {
  const end = run(c, { ...AT_REST, gear: Math.sign(lever), power: 1 }, 400, { lever, wheel: 0 });
  return Math.abs(body_velocity(end).u);
}

/** Steady turn, degrees a second, at rest with the bow thruster full to starboard and the stern one full to port. */
export function measure_thrusters(c: Coefficients): number {
  const end = run(c, { ...AT_REST, bow: 1, stern: -1 }, 40, { lever: 0, wheel: 0, bow: 1, stern: -1 });
  return (end.r * 180) / Math.PI;
}

export function measure_carry(c: Coefficients): number {
  let boat: Boat = { ...AT_REST, vx: 1 };
  while (speed(boat) > 0.1) boat = step_boat(boat, { lever: 0, wheel: 0 }, c, DT);
  return boat.x;
}

/** The force constants that make the boat feel the way its spec says. */
export function coefficients(spec: BoatSpec): Coefficients {
  const c = base(spec);
  const u = spec.top_speed;
  const xuu_max = spec.thrust / (u * u);
  const linear = (xuu: number) => (spec.thrust - xuu * u * u) / u;
  c.xuu = solve((xuu) => measure_carry({ ...c, xu: linear(xuu), xuu }), spec.carry, QUADRATIC_MIN * xuu_max, xuu_max * 0.98, 30);
  c.xu = linear(c.xuu);
  c.thrust_astern = c.xu * spec.astern_speed + c.xuu * spec.astern_speed ** 2;
  c.yv = spec.grip * c.xu;
  c.yvv = spec.grip * c.xuu;
  c.nr = 0.02 * c.yv * spec.length ** 2;
  c.rudder = solve((k) => measure_turn({ ...c, rudder: k }), spec.turn_rate, 0, c.yv * 20);
  if (spec.drive === Drive.OUTBOARD) {
    // The leg swings to its full lock, so the kick comes from yaw damping; the leg's own grip (the turn) is solved with it until the two settle.
    const keel = c.nr;
    for (let i = 0; i < 3; i++) {
      c.nr = solve((nr) => -measure_kick({ ...c, nr }), -spec.kick, 0, keel * 20, 30);
      c.rudder = solve((k) => measure_turn({ ...c, rudder: k }), spec.turn_rate, 0, c.yv * 20);
    }
  } else {
    c.walk = spec.walk > 0 ? solve((k) => measure_walk({ ...c, walk: k }), spec.walk, 0, 1) : 0;
    c.wash = solve((w) => measure_kick({ ...c, wash: w }), spec.kick, 0, 400);
  }
  if (spec.thrusters) c.thruster = solve((k) => measure_thrusters({ ...c, thruster: k }), spec.thrusters.turn, 0, spec.mass * 2);
  return c;
}
