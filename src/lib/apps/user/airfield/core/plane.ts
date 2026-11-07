export const RHO = 1.225;
export const G = 9.81;

/** Body frame: x forward along the fuselage, z up, metres from the centre of gravity. */
export interface BodyPoint {
  x: number;
  z: number;
}

/**
 * A plane in what a pilot feels, not in coefficients: `coefficients` solves those so the plane meets these numbers.
 * Metres, kilograms, seconds; speeds in m/s, rates in degrees a second.
 */
export interface PlaneSpec {
  id: string;
  name: string;
  mass: number;
  wing_area: number;
  span: number;
  chord: number;
  length: number;
  /** Wing chord to fuselage, degrees. */
  incidence: number;
  /** Lift-curve zero, degrees of wing angle of attack. */
  zero_lift: number;
  oswald: number;
  /** Power-off stall at 1 g, flaps up and full. */
  stall_speed: number;
  flap_stall: number;
  /** Best glide at idle, flaps up, distance over height. */
  glide: number;
  /** Best steady climb at full throttle, flaps up, m/s. */
  climb: number;
  /** Level speed at the cruise detent. */
  cruise: number;
  /** Speed flown hands off with the trim at zero, flaps up. */
  trim_speed: number;
  /** Peak pitch rate in 2 s of full back stick from level flight at the trim speed. */
  pitch_rate: number;
  /** Metres from touchdown at 1.05 × flap stall to a stop: idle, full flaps, stick back, half brakes. */
  rollout: number;
  /** Fixed gear's drag coefficient, on top of the solved clean drag. */
  gear_drag: number;
  /** Full flaps' extra drag coefficient and pitching moment (nose down negative). */
  flap_drag: number;
  flap_pitch: number;
  /** Idle as a share of full power, and the engine's time constant. */
  idle: number;
  engine_lag: number;
  elevator_lag: number;
  /** Seconds from flaps up to full. */
  flap_time: number;
  prop_radius: number;
  gear: { main: BodyPoint; tail: BodyPoint };
  /** The prop tip at its lowest, the wing's height for ground effect, and the points that end a flight on the ground. */
  prop: BodyPoint;
  wing: BodyPoint;
  hull: readonly BodyPoint[];
}

export interface Coefficients {
  spec: PlaneSpec;
  mass: number;
  inertia: number;
  cl_alpha: number;
  alpha0: number;
  cl_max: number;
  /** Wing angle where the straight part would reach `cl_max`; the curve is rounded `ROUND` either side and peaks at its end. */
  alpha_break: number;
  flap_cl: number;
  cd0: number;
  k: number;
  thrust: number;
  /** Airspeed where the prop's thrust runs out. */
  zero_thrust: number;
  cm0: number;
  cm_alpha: number;
  cm_elevator: number;
  cm_q: number;
  cm_stall: number;
  brake: number;
}

/** The air the plane flies through: horizontal wind along +x (blowing toward +x), rising air, and the ground's rolling friction. */
export interface Env {
  wind: number;
  updraft: number;
  roll: number;
}

export const ROLL_ASPHALT = 0.025;
export const ROLL_GRASS = 0.05;
export const CALM: Env = { wind: 0, updraft: 0, roll: ROLL_ASPHALT };

export interface Input {
  /** 0 idle to 1 full. */
  throttle: number;
  /** −1 full forward to 1 full back (nose up), on top of the trim. */
  stick: number;
  trim: number;
  /** 0 up to 1 full. */
  flaps: number;
  brake: number;
  /** The way the pilot wants to face: 1 along +x, −1 back. */
  facing: number;
}

export interface Plane {
  x: number;
  /** Height of the centre of gravity above the ground. */
  h: number;
  /** Ground velocity: along the view, into it, and up. */
  vx: number;
  vz: number;
  vy: number;
  /** Heading in the horizontal plane: 0 along +x, π back along −x; grows through a turn. */
  yaw: number;
  /** Nose above the horizon, radians, and its rate. */
  pitch: number;
  q: number;
  bank: number;
  /** 0 to 1, the engine's answer to the throttle. */
  spool: number;
  /** The elevator's actual deflection, −1 to 1, and the flaps' travel, 0 to 1. */
  elevator: number;
  flaps: number;
  main_on: boolean;
  tail_on: boolean;
}

const BANK = (30 * Math.PI) / 180;
const ROLL_RATE = 0.8;
const ROLL_OUT = 0.5;
const GROUND_TURN = 0.6;
const GROUND_TURN_SPEED = 6;
const PROP_WASH = 0.35;
/** The lift curve is rounded over this many radians before its peak. */
export const ROUND = 0.035;
const STALL_BREAK = 0.06;
const STALL_LOSS = 0.4;
const CL_MIN = -1.1;
const MAIN_OMEGA = 12;
const TAIL_OMEGA = 22;
const GEAR_DAMPING = 0.7;
const DAMPING_RATIO = 0.55;
const CM_ALPHA = -1.2;
export const DT = 1 / 120;

function wrap(angle: number): number {
  return angle - 2 * Math.PI * Math.floor((angle + Math.PI) / (2 * Math.PI));
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}

function approach(value: number, target: number, step: number): number {
  return value < target ? Math.min(target, value + step) : Math.max(target, value - step);
}

/** 0 below the curve's peak, rising to 1 a few degrees past it: how far the flow has broken away. */
export function separation(alpha: number, c: Coefficients): number {
  const past = alpha - (c.alpha_break + ROUND);
  const neg = c.alpha0 + CL_MIN / c.cl_alpha - ROUND - alpha;
  const p = Math.max(past, neg);
  return p > 0 ? 1 - Math.exp(-p / STALL_BREAK) : 0;
}

/** The wing's lift coefficient: straight, rounded over the top, then broken past the peak, a flat plate far beyond. */
export function lift_coefficient(alpha: number, flaps: number, c: Coefficients): number {
  const extra = c.flap_cl * flaps;
  const a = c.cl_alpha;
  const top = c.alpha_break;
  const bottom = c.alpha0 + CL_MIN / a;
  const plate = 1.1 * Math.sin(2 * alpha);
  let cl: number;
  if (alpha >= top - ROUND && alpha <= top + ROUND) cl = c.cl_max - (a * (top + ROUND - alpha) ** 2) / (4 * ROUND);
  else if (alpha > top + ROUND) {
    const past = alpha - top - ROUND;
    const broken = c.cl_max * (1 - STALL_LOSS + STALL_LOSS * Math.exp(-past / STALL_BREAK));
    const w = clamp((past - 0.3) / 0.4, 0, 1);
    cl = (1 - w) * broken + w * plate;
  } else if (alpha < bottom - ROUND) {
    const past = bottom - ROUND - alpha;
    const broken = CL_MIN * (1 - STALL_LOSS + STALL_LOSS * Math.exp(-past / STALL_BREAK));
    const w = clamp((past - 0.3) / 0.4, 0, 1);
    cl = (1 - w) * broken + w * plate;
  } else if (alpha < bottom + ROUND) cl = CL_MIN + (a * (alpha - bottom + ROUND) ** 2) / (4 * ROUND);
  else cl = a * (alpha - c.alpha0);
  return cl + extra * (1 - separation(alpha, c) * 0.5);
}

/** Induced drag's share left at a wing height `height` above the ground: 1 high up, falling inside a span. */
export function ground_effect(height: number, span: number): number {
  const r = (16 * Math.max(height, 0.05)) / span;
  return (r * r) / (1 + r * r);
}

export function drag_coefficient(alpha: number, cl: number, flaps: number, ge: number, c: Coefficients): number {
  const s = c.spec;
  return c.cd0 + s.gear_drag + s.flap_drag * flaps + c.k * ge * cl * cl + 1.2 * Math.sin(alpha) ** 2 * separation(alpha, c);
}

export function thrust(spool: number, airspeed: number, c: Coefficients): number {
  return c.thrust * spool * Math.max(-0.3, 1 - airspeed / c.zero_thrust);
}

export function spool_for(throttle: number, c: Coefficients): number {
  return c.spec.idle + (1 - c.spec.idle) * clamp(throttle, 0, 1);
}

export interface Air {
  /** Airspeed, along the heading's vertical plane: forward and up. */
  speed: number;
  u: number;
  w: number;
  /** Flight path through the air and the wing's angle of attack, radians. */
  gamma: number;
  alpha: number;
}

export function air_of(plane: Plane, c: Coefficients, env: Env = CALM): Air {
  const ax = plane.vx - env.wind;
  const az = plane.vz;
  const w = plane.vy - env.updraft;
  const u = ax * Math.cos(plane.yaw) + az * Math.sin(plane.yaw);
  const speed = Math.hypot(u, w);
  const gamma = speed > 0.05 ? Math.atan2(w, u) : 0;
  const alpha = wrap(plane.pitch + (c.spec.incidence * Math.PI) / 180 - gamma);
  return { speed, u, w, gamma, alpha };
}

export function ground_speed(plane: Plane): number {
  return plane.vx * Math.cos(plane.yaw) + plane.vz * Math.sin(plane.yaw);
}

/** Where a body point is: metres along the heading from the centre of gravity, and its height above the ground. */
export function point_at(plane: Pick<Plane, "h" | "pitch">, p: BodyPoint): { s: number; up: number; height: number } {
  const cos = Math.cos(plane.pitch);
  const sin = Math.sin(plane.pitch);
  const s = p.x * cos - p.z * sin;
  const up = p.x * sin + p.z * cos;
  return { s, up, height: plane.h + up };
}

export function point_climb(plane: Plane, p: BodyPoint): number {
  return plane.vy + plane.q * point_at(plane, p).s;
}

export function facing(plane: Pick<Plane, "yaw">): number {
  return Math.cos(plane.yaw) >= 0 ? 1 : -1;
}

export function rest_pose(c: Coefficients): { h: number; pitch: number } {
  const { main, tail } = c.spec.gear;
  const pitch = Math.atan2(tail.z - main.z, main.x - tail.x);
  const settle = (c.mass * G) / (c.mass * MAIN_OMEGA * MAIN_OMEGA);
  return { pitch, h: -point_at({ h: 0, pitch }, main).up - settle * 0.9 };
}

export function create_plane(c: Coefficients, x: number, face = 1): Plane {
  const rest = rest_pose(c);
  return {
    x,
    h: rest.h,
    vx: 0,
    vz: 0,
    vy: 0,
    yaw: face > 0 ? 0 : Math.PI,
    pitch: rest.pitch,
    q: 0,
    bank: 0,
    spool: c.spec.idle,
    elevator: 0,
    flaps: 0,
    main_on: true,
    tail_on: true,
  };
}

/** The elevator that holds `alpha` with no pitch rate, propwash left out. */
export function elevator_for(alpha: number, flaps: number, c: Coefficients): number {
  return -(c.cm0 + c.cm_alpha * Math.sin(alpha) + c.spec.flap_pitch * flaps + c.cm_stall * separation(alpha, c)) / c.cm_elevator;
}

/**
 * Signed radians of turn left before the plane faces `face`, the short way round; a fresh half turn goes the positive
 * way, so a circuit's turns all bank the same side. A slight overshoot comes back instead of going round again.
 */
export function turn_left(plane: Pick<Plane, "yaw">, face: number): number {
  const left = wrap((face > 0 ? 0 : Math.PI) - plane.yaw);
  if (Math.abs(left) < 2e-3) return 0;
  return left <= -Math.PI + 1e-6 ? Math.PI : left;
}

function contact(plane: Plane, p: BodyPoint, k: number, damping: number, mu: number, u: number): { fs: number; fy: number; torque: number; on: boolean } {
  const at = point_at(plane, p);
  if (at.height >= 0) return { fs: 0, fy: 0, torque: 0, on: false };
  const climb = plane.vy + plane.q * at.s;
  const normal = Math.max(0, -k * at.height - damping * climb);
  const slide = u - plane.q * at.up;
  const fs = -mu * normal * Math.tanh(slide / 0.3);
  return { fs, fy: normal, torque: at.s * normal - at.up * fs, on: true };
}

export function step_plane(plane: Plane, input: Input, c: Coefficients, dt: number, env: Env = CALM): Plane {
  const s = c.spec;
  const spool = plane.spool + (spool_for(input.throttle, c) - plane.spool) * (1 - Math.exp(-dt / s.engine_lag));
  const command = clamp(input.trim + input.stick, -1, 1);
  const elevator = plane.elevator + (command - plane.elevator) * (1 - Math.exp(-dt / s.elevator_lag));
  const flaps = approach(plane.flaps, clamp(input.flaps, 0, 1), dt / s.flap_time);

  const air = air_of(plane, c, env);
  const V = air.speed;
  const qbar = 0.5 * RHO * V * V;
  const along = air.u * Math.cos(plane.pitch) + air.w * Math.sin(plane.pitch);
  const T = thrust(spool, along, c);
  const wing = point_at(plane, s.wing);
  const ge = ground_effect(wing.height, s.span);
  const cl = lift_coefficient(air.alpha, flaps, c) * (1 + 0.08 * (1 - ge));
  const cd = drag_coefficient(air.alpha, cl, flaps, ge, c);
  const L = qbar * s.wing_area * cl;
  const D = qbar * s.wing_area * cd;
  const ux = V > 0.05 ? air.u / V : 1;
  const wy = V > 0.05 ? air.w / V : 0;
  const lift_up = L * Math.cos(plane.bank);
  let fs = T * Math.cos(plane.pitch) - D * ux - lift_up * wy;
  let fy = T * Math.sin(plane.pitch) - D * wy + lift_up * ux - c.mass * G;
  const fp = L * Math.sin(plane.bank);

  const wash = qbar + (PROP_WASH * Math.max(0, T)) / (Math.PI * s.prop_radius ** 2);
  const sep = separation(air.alpha, c);
  let moment =
    qbar * s.wing_area * s.chord * (c.cm0 + c.cm_alpha * Math.sin(air.alpha) + s.flap_pitch * flaps + c.cm_stall * sep) +
    wash * s.wing_area * s.chord * c.cm_elevator * elevator +
    0.25 * RHO * V * s.wing_area * s.chord * s.chord * c.cm_q * plane.q;

  const u = ground_speed(plane);
  const main_k = c.mass * MAIN_OMEGA * MAIN_OMEGA;
  const tail_arm = Math.hypot(s.gear.tail.x, s.gear.tail.z);
  const tail_mass = c.inertia / (tail_arm * tail_arm);
  const tail_k = tail_mass * TAIL_OMEGA * TAIL_OMEGA;
  const main = contact(plane, s.gear.main, main_k, 2 * GEAR_DAMPING * Math.sqrt(main_k * c.mass), env.roll + c.brake * clamp(input.brake, 0, 1), u);
  const tail = contact(plane, s.gear.tail, tail_k, 2 * GEAR_DAMPING * Math.sqrt(tail_k * tail_mass), env.roll * 2, u);
  fs += main.fs + tail.fs;
  fy += main.fy + tail.fy;
  moment += main.torque + tail.torque;
  const grounded = main.on || tail.on;

  const cos = Math.cos(plane.yaw);
  const sin = Math.sin(plane.yaw);
  let vx = plane.vx + ((fs * cos - fp * sin) / c.mass) * dt;
  let vz = plane.vz + ((fs * sin + fp * cos) / c.mass) * dt;
  const vy = plane.vy + (fy / c.mass) * dt;
  const q = plane.q + (moment / c.inertia) * dt;
  let yaw = plane.yaw;
  let bank = plane.bank;

  const left = turn_left(plane, input.facing);
  if (grounded) {
    bank = 0;
    let along_now = vx * cos + vz * sin;
    if (left !== 0 && Math.abs(along_now) < GROUND_TURN_SPEED) yaw += Math.sign(left) * Math.min(Math.abs(left), GROUND_TURN * dt);
    const traction = main.fy + tail.fy;
    if (Math.abs(along_now) < 0.03 && Math.abs(fs - main.fs - tail.fs) < (env.roll + c.brake * clamp(input.brake, 0, 1)) * traction) along_now = 0;
    vx = along_now * Math.cos(yaw);
    vz = along_now * Math.sin(yaw);
  } else {
    const ax = vx - env.wind;
    const turn = wrap(Math.atan2(vz, ax) - yaw);
    if (Math.hypot(ax, vz) > 1 && Math.abs(turn) < Math.PI / 2) yaw += turn;
    const goal = left !== 0 ? Math.sign(left) * BANK * clamp(Math.abs(left) / ROLL_OUT, 0.15, 1) : 0;
    bank = approach(bank, goal, ROLL_RATE * dt);
  }

  return {
    x: plane.x + vx * dt,
    h: plane.h + vy * dt,
    vx,
    vz,
    vy,
    yaw,
    pitch: wrap(plane.pitch + q * dt),
    q,
    bank,
    spool,
    elevator,
    flaps,
    main_on: main.on,
    tail_on: tail.on,
  };
}

export function airborne(plane: Plane): boolean {
  return !plane.main_on && !plane.tail_on;
}

// Feel probes. Each runs the plane's own force functions, quasi-static where a steady state is asked for.

function weight(c: Coefficients): number {
  return c.mass * G;
}

/** Lowest 1 g speed, power off: the top of the lift curve. */
export function measure_stall(c: Coefficients, flaps = 0): number {
  let top = 0;
  for (let alpha = c.alpha0; alpha < c.alpha_break + 0.3; alpha += 0.001) top = Math.max(top, lift_coefficient(alpha, flaps, c));
  return Math.sqrt((2 * weight(c)) / (RHO * c.spec.wing_area * top));
}

function alpha_for(cl: number, flaps: number, c: Coefficients): number {
  const wing = cl - c.flap_cl * flaps;
  const a = c.cl_alpha;
  if (wing <= c.cl_max - a * ROUND && wing >= CL_MIN + a * ROUND) return c.alpha0 + wing / a;
  if (wing > c.cl_max - a * ROUND && wing <= c.cl_max) return c.alpha_break + ROUND - Math.sqrt((4 * ROUND * (c.cl_max - wing)) / a);
  let lo = c.alpha0 - 0.3;
  let hi = c.alpha_break + ROUND;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (lift_coefficient(mid, flaps, c) < cl) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Steady flight path at airspeed V: sin γ from the excess of thrust over drag, lift balancing weight × cos γ. */
function steady_gamma(V: number, spool: number, flaps: number, c: Coefficients): number | null {
  const s = c.spec;
  const qs = 0.5 * RHO * V * V * s.wing_area;
  let gamma = 0;
  for (let i = 0; i < 8; i++) {
    const cl = (weight(c) * Math.cos(gamma)) / qs;
    if (cl > c.cl_max + c.flap_cl * flaps) return null;
    const alpha = alpha_for(cl, flaps, c);
    const pitch = alpha - (s.incidence * Math.PI) / 180 + gamma;
    const T = thrust(spool, V * Math.cos(alpha - (s.incidence * Math.PI) / 180), c);
    const D = qs * drag_coefficient(alpha, cl, flaps, 1, c);
    gamma = Math.asin(clamp((T * Math.cos(pitch - gamma) - D) / weight(c), -1, 1));
  }
  return gamma;
}

function best(over: (V: number) => number | null, c: Coefficients): { V: number; value: number } {
  let top = { V: 0, value: -Infinity };
  const from = c.spec.stall_speed * 1.05;
  for (let V = from; V < c.zero_thrust; V += 1) {
    const value = over(V);
    if (value !== null && value > top.value) top = { V, value };
  }
  for (let V = top.V - 1; V < top.V + 1; V += 0.05) {
    const value = over(V);
    if (V >= from && value !== null && value > top.value) top = { V, value };
  }
  return top;
}

export function measure_glide(c: Coefficients): number {
  return best((V) => {
    const gamma = steady_gamma(V, c.spec.idle, 0, c);
    return gamma === null || gamma >= 0 ? null : -1 / Math.tan(gamma);
  }, c).value;
}

/** Best steady climb rate at full throttle, flaps up, and the speed it comes at. */
export function measure_climb(c: Coefficients): { rate: number; speed: number } {
  const top = best((V) => {
    const gamma = steady_gamma(V, 1, 0, c);
    return gamma === null ? null : V * Math.sin(gamma);
  }, c);
  return { rate: top.value, speed: top.V };
}

/** Level speed at a throttle setting, flaps up: the fastest speed where the plane still holds height. */
export function measure_level(c: Coefficients, throttle: number): number {
  const spool = spool_for(throttle, c);
  let lo = measure_stall(c) * 1.2;
  let hi = c.zero_thrust;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const gamma = steady_gamma(mid, spool, 0, c);
    if (gamma !== null && gamma > 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export function level_flight(c: Coefficients, V: number, face = 1): { plane: Plane; throttle: number; trim: number } {
  const s = c.spec;
  const cl = weight(c) / (0.5 * RHO * V * V * s.wing_area);
  const alpha = alpha_for(cl, 0, c);
  const pitch = alpha - (s.incidence * Math.PI) / 180;
  const D = 0.5 * RHO * V * V * s.wing_area * drag_coefficient(alpha, cl, 0, 1, c);
  const spool = D / Math.cos(pitch) / (c.thrust * (1 - (V * Math.cos(pitch)) / c.zero_thrust));
  const throttle = clamp((spool - s.idle) / (1 - s.idle), 0, 1);
  const plane: Plane = {
    ...create_plane(c, 0, face),
    h: 500,
    vx: V * face,
    yaw: face > 0 ? 0 : Math.PI,
    pitch,
    spool,
    elevator: elevator_for(alpha, 0, c),
    main_on: false,
    tail_on: false,
  };
  return { plane, throttle, trim: plane.elevator };
}

export const CRUISE_THROTTLE = 0.75;

/** Peak pitch rate, degrees a second, in 2 s of full back stick from trimmed level flight at the trim speed. */
export function measure_pitch_rate(c: Coefficients): number {
  const start = level_flight(c, c.spec.trim_speed);
  let plane = start.plane;
  let top = 0;
  const input: Input = { throttle: start.throttle, stick: 2, trim: 0, flaps: 0, brake: 0, facing: 1 };
  for (let t = 0; t < 2; t += DT) {
    plane = step_plane(plane, input, c, DT);
    top = Math.max(top, plane.q);
  }
  return (top * 180) / Math.PI;
}

/** Hands-off speed: level flight's speed where the trimmed elevator is zero. */
export function measure_trim_speed(c: Coefficients): number {
  let lo = measure_stall(c) * 1.02;
  let hi = c.zero_thrust;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (level_flight(c, mid).trim > 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Ground roll after touchdown at 1.05 × flap stall: idle, full flaps, stick back, `brake` share. */
export function measure_rollout(c: Coefficients, brake = 0.5): number {
  const rest = rest_pose(c);
  const V = measure_stall(c, 1) * 1.05;
  let plane: Plane = { ...create_plane(c, 0), h: rest.h + 0.02, vx: V, flaps: 1, spool: c.spec.idle, elevator: 1 };
  const input: Input = { throttle: 0, stick: 1, trim: 0, flaps: 1, brake, facing: 1 };
  for (let t = 0; t < 90 && (plane.vx > 0.05 || t < 1); t += DT) plane = step_plane(plane, input, c, DT);
  return plane.x;
}

/** From rest at full throttle, flaps `flaps`, stick and trim neutral: the roll to the wheels leaving the ground, and the speed then. */
export function measure_takeoff(c: Coefficients, flaps = 0.5): { roll: number; speed: number } {
  let plane = create_plane(c, 0);
  const input: Input = { throttle: 1, stick: 0, trim: 0, flaps, brake: 0, facing: 1 };
  plane = { ...plane, flaps };
  for (let t = 0; t < 3; t += DT) plane = step_plane(plane, { ...input, throttle: 0 }, c, DT);
  const from = plane.x;
  let off = 0;
  for (let t = 0; t < 60; t += DT) {
    plane = step_plane(plane, input, c, DT);
    off = airborne(plane) ? off + DT : 0;
    if (off >= 0.5) break;
  }
  return { roll: plane.x - plane.vx * 0.5 - from, speed: plane.vx };
}

/** Metres floated in ground effect, wings 1.5 m up, idle and full flaps, from 1.3 × to 1.05 × flap stall. */
export function measure_float(c: Coefficients): number {
  const s = c.spec;
  const stall = measure_stall(c, 1);
  const ge = ground_effect(1.5 + s.wing.z, s.span);
  let V = stall * 1.3;
  let x = 0;
  while (V > stall * 1.05) {
    const qs = 0.5 * RHO * V * V * s.wing_area;
    const cl = weight(c) / qs / (1 + 0.08 * (1 - ge));
    const alpha = alpha_for(cl, 1, c);
    const D = qs * drag_coefficient(alpha, cl, 1, ge, c) - thrust(s.idle, V, c);
    V -= (D / c.mass) * DT;
    x += V * DT;
  }
  return x;
}


function solve(measure: (x: number) => number, target: number, lo: number, hi: number, rounds = 40): number {
  for (let i = 0; i < rounds; i++) {
    const mid = (lo + hi) / 2;
    if (measure(mid) < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function base(s: PlaneSpec): Coefficients {
  const aspect = (s.span * s.span) / s.wing_area;
  const cl_alpha = (2 * Math.PI * aspect) / (aspect + 2);
  const alpha0 = (s.zero_lift * Math.PI) / 180;
  const cl_max = (2 * s.mass * G) / (RHO * s.wing_area * s.stall_speed ** 2);
  return {
    spec: s,
    mass: s.mass,
    inertia: s.mass * (0.24 * s.length) ** 2,
    cl_alpha,
    alpha0,
    cl_max,
    alpha_break: alpha0 + cl_max / cl_alpha,
    flap_cl: (2 * s.mass * G) / (RHO * s.wing_area * s.flap_stall ** 2) - cl_max,
    cd0: 0.03,
    k: 1 / (Math.PI * s.oswald * aspect),
    thrust: s.mass * 3,
    zero_thrust: s.cruise * 2.5,
    cm0: 0,
    cm_alpha: CM_ALPHA,
    cm_elevator: 0.5,
    cm_q: 0,
    cm_stall: -0.2,
    brake: 0.3,
  };
}

function pitch_axis(c: Coefficients): void {
  const s = c.spec;
  const alpha_trim = alpha_for((2 * c.mass * G) / (RHO * s.wing_area * s.trim_speed ** 2), 0, c);
  c.cm0 = -c.cm_alpha * Math.sin(alpha_trim);
  const alpha_full = c.alpha_break + ROUND + 0.04;
  c.cm_elevator = -(c.cm0 + c.cm_alpha * Math.sin(alpha_full) + c.cm_stall * separation(alpha_full, c));
  const V = s.trim_speed;
  const stiffness = -c.cm_alpha * 0.5 * RHO * V * V * s.wing_area * s.chord;
  c.cm_q = (-2 * DAMPING_RATIO * Math.sqrt(stiffness * c.inertia)) / (0.25 * RHO * V * s.wing_area * s.chord * s.chord);
}

export function coefficients(spec: PlaneSpec): Coefficients {
  const c = base(spec);
  for (let round = 0; round < 3; round++) {
    c.cd0 = solve((cd0) => -measure_glide({ ...c, cd0 }), -spec.glide, 0.005, 0.2, 30);
    const climb_for = (zero_thrust: number) => {
      c.zero_thrust = zero_thrust;
      c.thrust = solve((t) => measure_climb({ ...c, thrust: t }).rate, spec.climb, c.mass * 0.5, c.mass * 8, 30);
      return measure_level(c, CRUISE_THROTTLE);
    };
    c.zero_thrust = solve(climb_for, spec.cruise, spec.cruise * 1.2, spec.cruise * 6, 24);
    climb_for(c.zero_thrust);
  }
  pitch_axis(c);
  c.inertia = solve((i) => -measure_pitch_rate({ ...c, inertia: i, ...with_damping(c, i) }), -spec.pitch_rate, spec.mass * (0.1 * spec.length) ** 2, spec.mass * (0.5 * spec.length) ** 2, 30);
  Object.assign(c, with_damping(c, c.inertia));
  c.brake = solve((mu) => -measure_rollout({ ...c, brake: mu }), -spec.rollout, 0, 1.2, 30);
  return c;
}

function with_damping(c: Coefficients, inertia: number): Pick<Coefficients, "cm_q"> {
  const probe = { ...c, inertia };
  pitch_axis(probe);
  return { cm_q: probe.cm_q };
}
