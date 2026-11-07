export const RHO = 1.225;
export const G = 9.81;

/** Body frame: x forward along the fuselage, z up, metres from the centre of gravity. */
export interface BodyPoint {
  x: number;
  z: number;
}

export const Engine = { PROP: "prop", JET: "jet", NONE: "none" } as const;
export type Engine = (typeof Engine)[keyof typeof Engine];

/** Where the second wheel sits: a tail wheel behind the mains, or a nose wheel ahead of them. */
export const GearLayout = { TAIL: "tail", NOSE: "nose" } as const;
export type GearLayout = (typeof GearLayout)[keyof typeof GearLayout];

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
  engine: Engine;
  /** Best steady climb at full throttle, flaps up, m/s. Not solved without an engine. */
  climb: number;
  /** Level speed at the cruise detent; without an engine, the speed flown between thermals, not solved. */
  cruise: number;
  /** Speed flown hands off with the trim at zero, flaps up. */
  trim_speed: number;
  /** Peak pitch rate in 2 s of full back stick from level flight at the trim speed. */
  pitch_rate: number;
  /**
   * Metres from touchdown at 1.05 × flap stall to a stop: idle (full reverse when it has it), full flaps, spoilers out
   * when it has them, stick back on a tail wheel or neutral on a nose wheel, half brakes or the autobrake.
   */
  rollout: number;
  /** Held full back at idle (`measure_stall_hold`): the pitch swing in degrees once the wing has stalled, and the sink in m/s. */
  stall_bob: number;
  stall_sink: number;
  /** How far the main gear settles under the plane's weight, metres: the bungee's stiffness. */
  gear_sag: number;
  /** The main gear's damping ratio while it compresses: low for a bungee, higher for an oleo. */
  gear_damping: number;
  /** Ground speed where full throttle and half forward stick lift the tail: how much the prop wash blows over the tail. Null with no prop. */
  tail_up_speed: number | null;
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
  /** Spoilers (or a glider's airbrakes) fully out: drag coefficient added, share of the wing's lift spoiled. 0 without. */
  spoiler_drag: number;
  spoiler_lift: number;
  /** Reverse thrust as a share of forward at the same spool, once the reverser is deployed on the ground; 0 without. */
  reverse: number;
  /** Brake share the autobrake holds after touchdown; 0 without. */
  autobrake: number;
  prop_radius: number;
  gear: { main: BodyPoint; aux: BodyPoint; layout: GearLayout };
  /** The prop tip or engine pod at its lowest: a strike ends the flight. Null without an engine. */
  prop: BodyPoint | null;
  /** A nose-wheel plane's tail bumper: touching it on rotation is a tail strike. */
  tail_skid: BodyPoint | null;
  /** The wing's height for ground effect, and the points that end a flight on the ground. */
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
  /** Drag of the separated wing: `cd_stall × sin²α × separation`. */
  cd_stall: number;
  /** Dynamic pressure over the tail from the prop, per newton of thrust over the disc. */
  prop_wash: number;
  /** The main gear's natural frequency on the plane's mass, rad/s, from `gear_sag`. */
  main_omega: number;
  brake: number;
}

/** The air the plane flies through: horizontal wind along +x (blowing toward +x), rising air, and the ground's rolling friction. */
export interface Env {
  wind: number;
  updraft: number;
  roll: number;
  /** Ground height at `x`, metres; flat at 0 without it. */
  ground?: (x: number) => number;
  /** Brake grip, 1 dry: a wet runway halves it. */
  grip?: number;
  /** An outside pull on the centre of gravity, newtons: the winch cable. */
  pull?: { x: number; y: number };
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
  /** Spoilers or airbrakes, 0 in to 1 out, and the reverser, 0 stowed to 1 deployed (only on the ground). */
  spoilers: number;
  reverse: number;
  /** The way the pilot wants to face: 1 along +x, −1 back. Only the ground pivot reads it; in the air the plane flies the way it faces. */
  facing: number;
}

export interface Plane {
  x: number;
  /** Height of the centre of gravity above the ground. */
  h: number;
  /** Ground velocity: along the view, into it (only while pivoting on the ground), and up. */
  vx: number;
  vz: number;
  vy: number;
  /** Heading in the horizontal plane: 0 along +x, π back along −x; between them only through the ground pivot. */
  yaw: number;
  /** Nose above the horizon, radians, and its rate. */
  pitch: number;
  q: number;
  /** 0 to 1, the engine's answer to the throttle. */
  spool: number;
  /** The elevator's actual deflection, −1 to 1, and the flaps' travel, 0 to 1. */
  elevator: number;
  flaps: number;
  /** Spoilers' and reverser's actual travel, 0 to 1. */
  spoilers: number;
  reverser: number;
  main_on: boolean;
  /** The second wheel, tail or nose. */
  aux_on: boolean;
}

const GROUND_TURN = 0.6;
const GROUND_TURN_SPEED = 6;
/** The lift curve is rounded over this many radians before its peak. */
export const ROUND = 0.035;
const STALL_BREAK = 0.06;
const STALL_LOSS = 0.4;
const CL_MIN = -1.1;
const AUX_OMEGA = 22;
/** Main gear damps only while the leg compresses, ramped in over the first part of the stroke so first contact has no spike. */
const GEAR_RAMP = 0.06;
const AUX_DAMPING = 0.7;
const SPOILER_TIME = 1;
const REVERSER_TIME = 1.5;
/** Full back stick holds the wing this far past the lift curve's peak. */
const HOLD_PAST_PEAK = (1 * Math.PI) / 180;
const DAMPING_RATIO = 0.8;
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

export function drag_coefficient(alpha: number, cl: number, flaps: number, ge: number, c: Coefficients, spoilers = 0): number {
  const s = c.spec;
  return c.cd0 + s.gear_drag + s.flap_drag * flaps + s.spoiler_drag * spoilers + c.k * ge * cl * cl + c.cd_stall * Math.sin(alpha) ** 2 * separation(alpha, c);
}

export function thrust(spool: number, airspeed: number, c: Coefficients, reverser = 0): number {
  return c.thrust * spool * Math.max(-0.3, 1 - airspeed / c.zero_thrust) * (1 - reverser * (1 + c.spec.reverse));
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
  const { main, aux } = c.spec.gear;
  // Each wheel sunk by its share of the weight over its spring: a stiff nose wheel set as deep as the mains would kick the nose up.
  const aux_share = Math.max(0, Math.min(1, -main.x / (aux.x - main.x)));
  const arm = Math.hypot(aux.x, aux.z);
  const main_sag = ((1 - aux_share) * G) / (c.main_omega * c.main_omega);
  const aux_sag = (aux_share * c.mass * G) / ((c.inertia / (arm * arm)) * AUX_OMEGA * AUX_OMEGA);
  const a = main.x - aux.x;
  const b = main.z - aux.z;
  let pitch = Math.atan(-b / a);
  for (let i = 0; i < 4; i++) pitch -= (a * Math.sin(pitch) + b * Math.cos(pitch) - (aux_sag - main_sag)) / (a * Math.cos(pitch) - b * Math.sin(pitch));
  return { pitch, h: -point_at({ h: 0, pitch }, main).up - main_sag };
}

export function create_plane(c: Coefficients, x: number, face = 1, ground = 0): Plane {
  const rest = rest_pose(c);
  return {
    x,
    h: rest.h + ground,
    vx: 0,
    vz: 0,
    vy: 0,
    yaw: face > 0 ? 0 : Math.PI,
    pitch: rest.pitch,
    q: 0,
    spool: c.spec.idle,
    elevator: 0,
    flaps: 0,
    spoilers: 0,
    reverser: 0,
    main_on: true,
    aux_on: true,
  };
}

/** The elevator that holds `alpha` with no pitch rate; `wash` is the tail's dynamic pressure over the wing's, the prop wash's share. */
export function elevator_for(alpha: number, flaps: number, c: Coefficients, wash = 1): number {
  return -(c.cm0 + c.cm_alpha * Math.sin(alpha) + c.spec.flap_pitch * flaps + c.cm_stall * separation(alpha, c)) / (c.cm_elevator * wash);
}

/** The tail's dynamic pressure over the wing's: 1 gliding, more with the prop blowing over it. */
export function wash_ratio(qbar: number, T: number, c: Coefficients): number {
  return qbar > 1 && c.prop_wash > 0 ? 1 + (c.prop_wash * Math.max(0, T)) / (Math.PI * c.spec.prop_radius ** 2) / qbar : 1;
}

/** The current flight's `wash_ratio`, for trimming. */
export function wash_now(plane: Plane, c: Coefficients, env: Env = CALM): number {
  const air = air_of(plane, c, env);
  const along = air.u * Math.cos(plane.pitch) + air.w * Math.sin(plane.pitch);
  return wash_ratio(0.5 * RHO * air.speed * air.speed, thrust(plane.spool, along, c, plane.reverser), c);
}

/** Signed radians of turn left before the plane faces `face`, the short way round; a fresh half turn goes the positive way. */
export function turn_left(plane: Pick<Plane, "yaw">, face: number): number {
  const left = wrap((face > 0 ? 0 : Math.PI) - plane.yaw);
  if (Math.abs(left) < 2e-3) return 0;
  return left <= -Math.PI + 1e-6 ? Math.PI : left;
}

/** A body point's height above the ground under it, and the ground's slope there (rise over run along +x). */
export function clearance(plane: Pick<Plane, "x" | "h" | "pitch" | "yaw">, p: BodyPoint, env: Env = CALM): { height: number; slope: number; s: number; up: number } {
  const at = point_at(plane, p);
  if (!env.ground) return { height: at.height, slope: 0, s: at.s, up: at.up };
  const x = plane.x + at.s * Math.cos(plane.yaw);
  return { height: at.height - env.ground(x), slope: env.ground(x + 0.5) - env.ground(x - 0.5), s: at.s, up: at.up };
}

function contact(plane: Plane, p: BodyPoint, k: number, damping: number, mu: number, u: number, bungee: boolean, env: Env): { fs: number; fy: number; torque: number; on: boolean } {
  const at = clearance(plane, p, env);
  if (at.height >= 0) return { fs: 0, fy: 0, torque: 0, on: false };
  const climb = plane.vy + plane.q * at.s - u * Math.cos(plane.yaw) * at.slope;
  const damp = !bungee ? damping : climb < 0 ? damping * Math.min(1, -at.height / GEAR_RAMP) : 0;
  const normal = Math.max(0, -k * at.height - damp * climb);
  const slide = u - plane.q * at.up;
  // A sloped ground pushes back along the slope too: uphill slows the roll, downhill speeds it.
  const fs = -mu * normal * Math.tanh(slide / 0.3) - normal * at.slope * Math.cos(plane.yaw);
  return { fs, fy: normal, torque: at.s * normal - at.up * fs, on: true };
}

export function step_plane(plane: Plane, input: Input, c: Coefficients, dt: number, env: Env = CALM): Plane {
  const s = c.spec;
  const spool = plane.spool + (spool_for(input.throttle, c) - plane.spool) * (1 - Math.exp(-dt / s.engine_lag));
  const command = clamp(input.trim + input.stick, -1, 1);
  const elevator = plane.elevator + (command - plane.elevator) * (1 - Math.exp(-dt / s.elevator_lag));
  const flaps = approach(plane.flaps, clamp(input.flaps, 0, 1), dt / s.flap_time);
  const spoilers = approach(plane.spoilers, s.spoiler_drag > 0 ? clamp(input.spoilers, 0, 1) : 0, dt / SPOILER_TIME);
  const reverser = approach(plane.reverser, s.reverse > 0 && plane.main_on ? clamp(input.reverse, 0, 1) : 0, dt / REVERSER_TIME);

  const air = air_of(plane, c, env);
  const V = air.speed;
  const qbar = 0.5 * RHO * V * V;
  const along = air.u * Math.cos(plane.pitch) + air.w * Math.sin(plane.pitch);
  const T = thrust(spool, along, c, reverser);
  const wing = clearance(plane, s.wing, env);
  const ge = ground_effect(wing.height, s.span);
  const cl = lift_coefficient(air.alpha, flaps, c) * (1 + 0.08 * (1 - ge)) * (1 - s.spoiler_lift * spoilers);
  const cd = drag_coefficient(air.alpha, cl, flaps, ge, c, spoilers);
  const L = qbar * s.wing_area * cl;
  const D = qbar * s.wing_area * cd;
  const ux = V > 0.05 ? air.u / V : 1;
  const wy = V > 0.05 ? air.w / V : 0;
  let fs = T * Math.cos(plane.pitch) - D * ux - L * wy + (env.pull?.x ?? 0) * Math.cos(plane.yaw);
  let fy = T * Math.sin(plane.pitch) - D * wy + L * ux - c.mass * G + (env.pull?.y ?? 0);

  const wash = qbar + (c.prop_wash * Math.max(0, T)) / (Math.PI * s.prop_radius ** 2);
  const sep = separation(air.alpha, c);
  let moment =
    qbar * s.wing_area * s.chord * (c.cm0 + c.cm_alpha * Math.sin(air.alpha) + s.flap_pitch * flaps + c.cm_stall * sep) +
    wash * s.wing_area * s.chord * c.cm_elevator * elevator +
    0.25 * RHO * V * s.wing_area * s.chord * s.chord * c.cm_q * plane.q;

  const u = ground_speed(plane);
  const main_k = c.mass * c.main_omega * c.main_omega;
  const aux_arm = Math.hypot(s.gear.aux.x, s.gear.aux.z);
  const aux_mass = c.inertia / (aux_arm * aux_arm);
  const aux_k = aux_mass * AUX_OMEGA * AUX_OMEGA;
  const braking = env.roll + c.brake * (env.grip ?? 1) * clamp(input.brake, 0, 1);
  const main = contact(plane, s.gear.main, main_k, 2 * s.gear_damping * Math.sqrt(main_k * c.mass), braking, u, true, env);
  const aux = contact(plane, s.gear.aux, aux_k, 2 * AUX_DAMPING * Math.sqrt(aux_k * aux_mass), env.roll * 2, u, false, env);
  fs += main.fs + aux.fs;
  fy += main.fy + aux.fy;
  moment += main.torque + aux.torque;
  const grounded = main.on || aux.on;

  const cos = Math.cos(plane.yaw);
  const sin = Math.sin(plane.yaw);
  let vx = plane.vx + ((fs * cos) / c.mass) * dt;
  let vz = plane.vz + ((fs * sin) / c.mass) * dt;
  const vy = plane.vy + (fy / c.mass) * dt;
  const q = plane.q + (moment / c.inertia) * dt;
  let yaw = plane.yaw;

  // A pivot starts only below taxi speed but, once under way, finishes: a plane left half turned would fly on sideways.
  const pivoting = Math.abs(Math.sin(yaw)) > 1e-3;
  if (grounded) {
    const left = turn_left(plane, input.facing);
    let along_now = vx * cos + vz * sin;
    if (left !== 0 && (pivoting || Math.abs(along_now) < GROUND_TURN_SPEED)) yaw += Math.sign(left) * Math.min(Math.abs(left), GROUND_TURN * dt);
    const traction = main.fy + aux.fy;
    if (Math.abs(along_now) < 0.03 && Math.abs(fs - main.fs - aux.fs) < braking * traction) along_now = 0;
    vx = along_now * Math.cos(yaw);
    vz = along_now * Math.sin(yaw);
  } else {
    if (pivoting) {
      const square = Math.cos(yaw) >= 0 ? 0 : Math.PI;
      const left = wrap(square - yaw);
      yaw += Math.sign(left) * Math.min(Math.abs(left), GROUND_TURN * dt);
    }
    vz = 0;
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
    spool,
    elevator,
    flaps,
    spoilers,
    reverser,
    main_on: main.on,
    aux_on: aux.on,
  };
}

export function airborne(plane: Plane): boolean {
  return !plane.main_on && !plane.aux_on;
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
  const qs = 0.5 * RHO * V * V * s.wing_area;
  if (c.thrust <= 0) {
    const gamma = steady_gamma(V, 0, 0, c) ?? 0;
    const alpha = alpha_for((weight(c) * Math.cos(gamma)) / qs, 0, c);
    const plane: Plane = {
      ...create_plane(c, 0, face),
      h: 500,
      vx: V * Math.cos(gamma) * face,
      vy: V * Math.sin(gamma),
      yaw: face > 0 ? 0 : Math.PI,
      pitch: alpha - (s.incidence * Math.PI) / 180 + gamma,
      spool: 0,
      elevator: elevator_for(alpha, 0, c),
      main_on: false,
      aux_on: false,
    };
    return { plane, throttle: 0, trim: plane.elevator };
  }
  let T = 0;
  let alpha = 0;
  let pitch = 0;
  for (let i = 0; i < 6; i++) {
    const cl = (weight(c) - T * Math.sin(pitch)) / qs;
    alpha = alpha_for(cl, 0, c);
    pitch = alpha - (s.incidence * Math.PI) / 180;
    T = (qs * drag_coefficient(alpha, cl, 0, 1, c)) / Math.cos(pitch);
  }
  const spool = T / (c.thrust * (1 - (V * Math.cos(pitch)) / c.zero_thrust));
  const throttle = clamp((spool - s.idle) / (1 - s.idle), 0, 1);
  const plane: Plane = {
    ...create_plane(c, 0, face),
    h: 500,
    vx: V * face,
    yaw: face > 0 ? 0 : Math.PI,
    pitch,
    spool,
    elevator: elevator_for(alpha, 0, c, wash_ratio(0.5 * RHO * V * V, T, c)),
    main_on: false,
    aux_on: false,
  };
  return { plane, throttle, trim: plane.elevator };
}

export const CRUISE_THROTTLE = 0.75;
export const REVERSE_THROTTLE = 0.8;

/** Peak pitch rate, degrees a second, in 2 s of full back stick from trimmed level flight at the trim speed. */
export function measure_pitch_rate(c: Coefficients): number {
  const start = level_flight(c, c.spec.trim_speed);
  let plane = start.plane;
  let top = 0;
  const input: Input = { throttle: start.throttle, stick: 2, trim: 0, flaps: 0, brake: 0, facing: 1, spoilers: 0, reverse: 0 };
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

export function measure_rollout(c: Coefficients, brake = 0.5): number {
  const s = c.spec;
  const rest = rest_pose(c);
  const V = measure_stall(c, 1) * 1.05;
  const stick = s.gear.layout === GearLayout.TAIL ? 1 : 0;
  const spoilers = s.spoiler_drag > 0 ? 1 : 0;
  const reverse = s.reverse > 0 ? 1 : 0;
  let plane: Plane = { ...create_plane(c, 0), h: rest.h + 0.02, vx: V, flaps: 1, spool: s.idle, elevator: stick, spoilers };
  const input: Input = { throttle: reverse * REVERSE_THROTTLE, stick, trim: 0, flaps: 1, brake: s.autobrake || brake, facing: 1, spoilers, reverse };
  for (let t = 0; t < 90 && (plane.vx > 0.05 || t < 1); t += DT) plane = step_plane(plane, input, c, DT);
  return plane.x;
}

/** From rest at full throttle, flaps `flaps`, stick and trim neutral: the roll to the wheels leaving the ground, and the speed then. */
export function measure_takeoff(c: Coefficients, flaps = 0.5): { roll: number; speed: number } {
  let plane = create_plane(c, 0);
  const input: Input = { throttle: 1, stick: 0, trim: 0, flaps, brake: 0, facing: 1, spoilers: 0, reverse: 0 };
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


/** Settled at rest, then full throttle, half flaps, `stick` held: the ground speed once the tail wheel has been off for 0.3 s, 99 if it never is. */
export function measure_tail_up(c: Coefficients, stick = -0.5): number {
  let plane = create_plane(c, 0);
  const input: Input = { throttle: 1, stick, trim: 0, flaps: 0.5, brake: 0, facing: 1, spoilers: 0, reverse: 0 };
  for (let t = 0; t < 2; t += DT) plane = step_plane(plane, { ...input, throttle: 0, stick: 0 }, c, DT);
  let up = 0;
  let speed = 0;
  for (let t = 0; t < 30; t += DT) {
    plane = step_plane(plane, input, c, DT);
    if (airborne(plane)) break;
    if (plane.aux_on) up = 0;
    else if ((up += DT) === DT) speed = plane.vx;
    if (up >= 0.3) return speed;
  }
  return 99;
}

/** Full back stick at idle for 25 s from trimmed level flight at 1.15 × stall: from 10 s on, the pitch swing (degrees), mean sink and top angle of attack. */
export function measure_stall_hold(c: Coefficients): { bob: number; sink: number; alpha_max: number } {
  let plane = level_flight(c, c.spec.stall_speed * 1.15).plane;
  const input: Input = { throttle: 0, stick: 1, trim: 0, flaps: 0, brake: 0, facing: 1, spoilers: 0, reverse: 0 };
  let low = Infinity;
  let high = -Infinity;
  let alpha_max = -Infinity;
  let sink = 0;
  let n = 0;
  for (let t = 0; t < 25; t += DT) {
    plane = step_plane(plane, input, c, DT);
    if (t < 10) continue;
    low = Math.min(low, plane.pitch);
    high = Math.max(high, plane.pitch);
    alpha_max = Math.max(alpha_max, air_of(plane, c).alpha);
    sink -= plane.vy;
    n++;
  }
  return { bob: ((high - low) * 180) / Math.PI, sink: sink / n, alpha_max };
}

/** Kicked 3 m/s fast from trimmed level flight at the trim speed, hands off: the speed oscillation's period (s) and damping ratio. */
export function measure_phugoid(c: Coefficients): { period: number; damping: number } {
  const start = level_flight(c, c.spec.trim_speed);
  let plane = { ...start.plane, vx: start.plane.vx + 3 };
  const input: Input = { throttle: start.throttle, stick: 0, trim: start.trim, flaps: 0, brake: 0, facing: 1, spoilers: 0, reverse: 0 };
  const speeds: number[] = [];
  for (let t = 0; t < 150; t += DT) {
    plane = step_plane(plane, input, c, DT);
    speeds.push(air_of(plane, c).speed);
  }
  const peaks: { t: number; v: number }[] = [];
  for (let i = 1; i < speeds.length - 1; i++) if (i * DT > 1 && speeds[i] > speeds[i - 1] && speeds[i] >= speeds[i + 1]) peaks.push({ t: i * DT, v: speeds[i] });
  const tail = speeds.slice(-Math.round(30 / DT));
  const mean = tail.reduce((a, b) => a + b, 0) / tail.length;
  if (peaks.length < 3) return { period: NaN, damping: NaN };
  const decrement = Math.log((peaks[0].v - mean) / (peaks[1].v - mean));
  return { period: (peaks[2].t - peaks[0].t) / 2, damping: decrement / Math.sqrt(4 * Math.PI ** 2 + decrement ** 2) };
}

/** A three-point touchdown at `sink` m/s, idle, full flaps, stick held back: the main gear's stroke (m), peak load factor and rebound (m). */
export function measure_touchdown(c: Coefficients, sink: number): { stroke: number; peak_g: number; bounce: number } {
  const flare = c.spec.gear.layout === GearLayout.NOSE ? (4 * Math.PI) / 180 : 0;
  const plane: Plane = { ...create_plane(c, 0), vx: c.spec.flap_stall * 1.0625, vy: -sink, pitch: Math.atan((c.spec.gear.aux.z - c.spec.gear.main.z) / (c.spec.gear.main.x - c.spec.gear.aux.x)) + flare, flaps: 1, elevator: 0.6, main_on: false, aux_on: false };
  let at = { ...plane, h: plane.h - point_at(plane, c.spec.gear.main).height + 0.005 };
  const input: Input = { throttle: 0, stick: 0.6, trim: 0, flaps: 1, brake: 0, facing: 1, spoilers: 0, reverse: 0 };
  let stroke = 0;
  let peak = 0;
  let bounce = 0;
  let left = false;
  for (let t = 0; t < 3; t += DT) {
    const before = at.vy;
    at = step_plane(at, input, c, DT);
    const height = point_at(at, c.spec.gear.main).height;
    stroke = Math.max(stroke, -height);
    peak = Math.max(peak, 1 + (at.vy - before) / DT / G);
    if (height > 0 && stroke > 0) left = true;
    if (left) bounce = Math.max(bounce, height);
  }
  return { stroke, peak_g: peak, bounce };
}

function solve(measure: (x: number) => number, target: number, lo: number, hi: number, rounds = 40): number {
  for (let i = 0; i < rounds; i++) {
    const mid = (lo + hi) / 2;
    if (measure(mid) < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** For a measure that isn't monotonic: the first crossing scanning up from `lo`, bisected; with none, the nearest sample. */
function solve_scan(measure: (x: number) => number, target: number, lo: number, hi: number, steps: number, rounds: number): number {
  let nearest = { x: lo, error: Infinity };
  let before = { x: lo, error: measure(lo) - target };
  for (let i = 1; i <= steps; i++) {
    const x = lo + ((hi - lo) * i) / steps;
    const error = measure(x) - target;
    if (Math.abs(before.error) < Math.abs(nearest.error)) nearest = before;
    if (Math.sign(error) !== Math.sign(before.error)) {
      const rising = error > before.error;
      return solve((v) => (rising ? measure(v) : 2 * target - measure(v)), target, before.x, x, rounds);
    }
    before = { x, error };
  }
  return Math.abs(before.error) < Math.abs(nearest.error) ? before.x : nearest.x;
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
    cd_stall: 1.2,
    prop_wash: 0.35,
    main_omega: Math.sqrt(G / s.gear_sag),
    brake: 0.3,
  };
}

function pitch_axis(c: Coefficients): void {
  const s = c.spec;
  const alpha_trim = alpha_for((2 * c.mass * G) / (RHO * s.wing_area * s.trim_speed ** 2), 0, c);
  c.cm0 = -c.cm_alpha * Math.sin(alpha_trim);
  const alpha_full = c.alpha_break + ROUND + HOLD_PAST_PEAK;
  c.cm_elevator = -(c.cm0 + c.cm_alpha * Math.sin(alpha_full) + c.cm_stall * separation(alpha_full, c));
  const V = s.trim_speed;
  const stiffness = -c.cm_alpha * 0.5 * RHO * V * V * s.wing_area * s.chord;
  c.cm_q = (-2 * DAMPING_RATIO * Math.sqrt(stiffness * c.inertia)) / (0.25 * RHO * V * s.wing_area * s.chord * s.chord);
}

export function coefficients(spec: PlaneSpec): Coefficients {
  const c = base(spec);
  const powered = spec.engine !== Engine.NONE;
  if (!powered) {
    c.thrust = 0;
    c.prop_wash = 0;
  }
  for (let round = 0; round < (powered ? 3 : 1); round++) {
    c.cd0 = solve((cd0) => -measure_glide({ ...c, cd0 }), -spec.glide, 0.005, 0.2, 30);
    if (!powered) break;
    const climb_for = (zero_thrust: number) => {
      c.zero_thrust = zero_thrust;
      c.thrust = solve((t) => measure_climb({ ...c, thrust: t }).rate, spec.climb, c.mass * 0.5, c.mass * 8, 30);
      return measure_level(c, CRUISE_THROTTLE);
    };
    c.zero_thrust = solve(climb_for, spec.cruise, spec.cruise * 1.2, spec.cruise * 6, 24);
    climb_for(c.zero_thrust);
  }
  const pitch = () => {
    pitch_axis(c);
    c.inertia = solve((i) => -measure_pitch_rate({ ...c, inertia: i, ...with_damping(c, i) }), -spec.pitch_rate, spec.mass * (0.1 * spec.length) ** 2, spec.mass * (0.5 * spec.length) ** 2, 30);
    Object.assign(c, with_damping(c, c.inertia));
  };
  for (let round = 0; round < 4; round++) {
    pitch();
    const tail_up = spec.tail_up_speed;
    c.prop_wash = tail_up === null ? 0 : solve((w) => -measure_tail_up({ ...c, prop_wash: w }), -tail_up, 0, 1.5, 16);
    c.cd_stall = solve((cd) => measure_stall_hold({ ...c, cd_stall: cd }).sink, spec.stall_sink, 0, 16, 14);
    Object.assign(c, with_stall(c, solve_scan((st) => measure_stall_hold(with_stall(c, st)).bob, spec.stall_bob, -1.1, -0.4, 7, 10)));
  }
  pitch();
  c.brake = solve((mu) => -measure_rollout({ ...c, brake: mu }), -spec.rollout, 0, 1.2, 30);
  return c;
}

/** `c` with the stall break `cm_stall` and the elevator re-solved, so full back stick still holds the same angle past the peak. */
function with_stall(c: Coefficients, cm_stall: number): Coefficients {
  const probe = { ...c, cm_stall };
  const cm_q = probe.cm_q;
  pitch_axis(probe);
  probe.cm_q = cm_q;
  return probe;
}

function with_damping(c: Coefficients, inertia: number): Pick<Coefficients, "cm_q"> {
  const probe = { ...c, inertia };
  pitch_axis(probe);
  return { cm_q: probe.cm_q };
}
