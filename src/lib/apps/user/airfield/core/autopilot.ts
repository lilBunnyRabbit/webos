import { COCKPITS } from "./cockpit";
import { ground_at, local, type Strip } from "./course";
import { Status, wheel_height } from "./flight";
import {
  air_of,
  airborne,
  alpha_for,
  drag_coefficient,
  DT,
  elevator_for,
  Engine,
  G,
  GearLayout,
  ground_speed,
  RHO,
  rest_pose,
  wash_now,
  type Coefficients,
  type Input,
  type Plane,
} from "./plane";
import { create_round, Goal, powered, round_env, step_round, type RoundState, type Scene } from "./round";

const TIME_LIMIT = 1500;
const DEG = Math.PI / 180;

export interface Proof {
  ok: boolean;
  reason?: string;
  /** Seconds the autopilot took: the level's par before slack. */
  time?: number;
  sink?: number;
  landings?: number;
}

export const Phase = { ROLL: "roll", CLIMB: "climb", CRUISE: "cruise", APPROACH: "approach", FLARE: "flare", ROLLOUT: "rollout" } as const;
export type Phase = (typeof Phase)[keyof typeof Phase];

/** What the autopilot aims for, worked out once per plane and scene. */
interface Plan {
  c: Coefficients;
  glider: boolean;
  /** No usable thrust: a glider, or a deadstick. */
  unpowered: boolean;
  takeoff_flaps: number;
  land_flaps: number;
  approach: number;
  climb: number;
  cruise: number;
  rotate: number;
  climb_pitch: number;
  pitch_rate: number;
  cruise_agl: number;
  slope: number;
  aim: number;
  flare: number;
  omega: number;
  /** Seconds ahead the flare looks: a heavy plane's path answers late, so it judges the height it will be at. */
  lead: number;
  flare_pitch: number;
}

export interface Pilot {
  phase: Phase;
  pitch_target: number;
  vs_sum: number;
  speed_sum: number;
  path_sum: number;
  throttle: number;
  spoilers: number;
  flaps: number;
  flare_sink: number;
  stick: number;
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}

function stall_at(c: Coefficients, flaps: number): number {
  return Math.sqrt((2 * c.mass * G) / (RHO * c.spec.wing_area * (c.cl_max + c.flap_cl * flaps)));
}

function plan_for(scene: Scene, c: Coefficients): Plan {
  const s = c.spec;
  const cockpit = COCKPITS[s.id as keyof typeof COCKPITS];
  const land_flaps = cockpit.flaps[cockpit.flaps.length - 1];
  const takeoff_flaps = cockpit.flaps[Math.min(cockpit.flaps.length - 1, Math.ceil((cockpit.flaps.length - 1) / 2))];
  const glider = s.engine === Engine.NONE;
  const jet = s.engine === Engine.JET;
  const gust = scene.course.weather.gust;
  const approach = stall_at(c, land_flaps) * (jet ? 1.27 : glider ? 1.25 : 1.3) + gust * 0.5;
  const strip = scene.strip;
  const length = strip.x1 - strip.x0;
  const sink = approach * Math.tan(scene.slope * DEG);
  return {
    c,
    glider,
    unpowered: glider || scene.power === 0,
    takeoff_flaps,
    land_flaps,
    approach,
    climb: stall_at(c, takeoff_flaps) * (jet ? 1.2 : 1.35),
    cruise: glider ? stall_at(c, 0) * 1.35 : jet ? 105 : s.cruise * 0.85,
    rotate: stall_at(c, takeoff_flaps) * (jet ? 1.08 : 1.1),
    climb_pitch: jet ? 8 * DEG : 11 * DEG,
    pitch_rate: jet ? 2.5 * DEG : 8 * DEG,
    cruise_agl: jet ? 500 : 160,
    slope: scene.slope * DEG,
    aim: clamp(length * (jet ? 0.12 : glider ? 0.08 : 0.15), 12, 350),
    flare: clamp(sink * (jet ? 3.5 : glider || scene.power === 0 ? 2.2 : 1.6), 1.5, 22),
    omega: jet ? 1.6 : glider ? 2.6 : 1.8,
    lead: jet ? 2.5 : glider || scene.power === 0 || c.flap_cl > 1 ? 1 : 0.4,
    flare_pitch: s.gear.layout === GearLayout.NOSE ? 6.5 * DEG : rest_pose(c).pitch + 3 * DEG,
  };
}

/** The top of the highest obstacle starting within `reach` metres ahead, as a height above the datum; null with none. */
function obstacle_ahead(scene: Scene, x: number, reach: number): number | null {
  const at = local(scene.course, x);
  let top: number | null = null;
  for (const o of scene.course.obstacles) {
    const ahead = o.x1 - at;
    const d = ahead - scene.course.wrap * Math.floor(ahead / scene.course.wrap);
    if (d > reach + (o.x1 - o.x0)) continue;
    const height = ground_at(scene.course, (o.x0 + o.x1) / 2) + o.top;
    top = top === null ? height : Math.max(top, height);
  }
  return top;
}

/** Metres ahead to the strip's aiming point, round the wrap. */
function to_aim(scene: Scene, strip: Strip, x: number, aim: number): number {
  const d = strip.x0 + aim - local(scene.course, x);
  const ahead = d - scene.course.wrap * Math.floor(d / scene.course.wrap);
  return ahead > scene.course.wrap - (strip.x1 - strip.x0) - 300 ? ahead - scene.course.wrap : ahead;
}

/** The pitch for a climb or sink of `vs` at the present airspeed: the wing angle that carries the weight, plus the path. */
function pitch_for(plan: Plan, plane: Plane, airspeed: number, vs: number, flaps: number, spoilers: number): { pitch: number; alpha: number } {
  const c = plan.c;
  const V = Math.max(airspeed, 5);
  const gamma = Math.asin(clamp(vs / V, -0.5, 0.5));
  const lift = (c.mass * G * Math.cos(gamma)) / (0.5 * RHO * V * V * c.spec.wing_area) / (1 - c.spec.spoiler_lift * spoilers);
  const alpha = alpha_for(Math.min(lift, c.cl_max + c.flap_cl * flaps - 0.05), flaps, c);
  return { pitch: alpha - c.spec.incidence * DEG + gamma, alpha };
}

function stick_for(plan: Plan, plane: Plane, target: number, alpha: number, flaps: number, state: RoundState): number {
  const c = plan.c;
  const env = round_env(state.scene, plane, state.flight.time);
  const air = air_of(plane, c, env);
  const wash = wash_now(plane, c, env);
  const qbar = Math.max(30, 0.5 * RHO * air.speed * air.speed) * wash;
  const authority = (qbar * c.spec.wing_area * c.spec.chord * c.cm_elevator) / c.inertia;
  const w = plan.omega;
  const feed = elevator_for(alpha, flaps, c, wash);
  return clamp(feed + (w * w * (target - plane.pitch) - 2 * 0.9 * w * plane.q) / authority, -1, 1);
}

function step_pilot(plan: Plan, pilot: Pilot, state: RoundState): Input {
  const { scene, flight } = state;
  const plane = flight.plane;
  const c = plan.c;
  const s = c.spec;
  const env = round_env(scene, plane, flight.time);
  const air = air_of(plane, c, env);
  const V = air.speed;
  const rise = ground_at(scene.course, plane.x + Math.max(0, ground_speed(plane)) * 2) - ground_at(scene.course, plane.x);
  const agl = Math.max(0, wheel_height(plane, c, env) - Math.max(0, rise));
  const ground = !airborne(plane);
  const d = to_aim(scene, scene.strip, plane.x, plan.aim);
  const aim_ground = ground_at(scene.course, scene.strip.x0 + plan.aim);
  const path = aim_ground + Math.tan(plan.slope) * d;
  const input: Input = { throttle: pilot.throttle, stick: 0, trim: 0, flaps: pilot.flaps, brake: 0, facing: 1, spoilers: pilot.spoilers, reverse: 0 };

  if (pilot.phase === Phase.ROLL) {
    input.throttle = 1;
    input.flaps = pilot.flaps = plan.takeoff_flaps;
    if (V < plan.rotate) {
      const tail = s.gear.layout === GearLayout.TAIL;
      input.stick = tail ? (plane.aux_on ? -0.6 : stick_for(plan, plane, rest_pose(c).pitch * 0.25, air.alpha, pilot.flaps, state)) : 0;
      pilot.pitch_target = plane.pitch;
      return input;
    }
    pilot.pitch_target = Math.min(plan.climb_pitch, pilot.pitch_target + plan.pitch_rate * DT);
    input.stick = stick_for(plan, plane, pilot.pitch_target, air.alpha, pilot.flaps, state);
    if (!ground && agl > 3) pilot.phase = Phase.CLIMB;
    return input;
  }

  if (pilot.phase === Phase.ROLLOUT) {
    const tail = s.gear.layout === GearLayout.TAIL;
    input.throttle = 0;
    input.spoilers = 1;
    input.flaps = pilot.flaps;
    if (!ground) {
      const want = pitch_for(plan, plane, V, -0.3, pilot.flaps, 1);
      input.stick = stick_for(plan, plane, Math.max(want.pitch, pilot.pitch_target), want.alpha, pilot.flaps, state);
      return input;
    }
    const remaining = scene.strip.x1 - local(scene.course, plane.x) - s.length * 0.5;
    const u = Math.max(0, ground_speed(plane));
    const need = (u * u) / (2 * Math.max(5, remaining - 15));
    const grip = (env.grip ?? 1) * c.brake * G;
    // A wheel landing: the tail stays up until the speed is gone, so pulling back doesn't fly it off again.
    const settled = plan.glider || (tail ? plane.aux_on || u < plan.approach * 0.6 : plane.aux_on);
    input.brake = !settled ? 0 : u < 0.3 ? 1 : clamp((need * 1.6) / Math.max(0.05, grip) + 0.15, 0.25, plan.glider ? 0.6 : tail ? Math.min(0.75, 0.29 / c.brake) : 1);
    if (s.reverse > 0) {
      input.throttle = u > 30 ? 0.8 : 0;
      input.reverse = 1;
    }
    const slope = (ground_at(scene.course, plane.x + 5) - ground_at(scene.course, plane.x - 5)) / 10;
    if (tail) input.stick = u > plan.approach * 0.7 && !plan.glider ? stick_for(plan, plane, Math.max(pilot.pitch_target, Math.atan(slope) + 2 * DEG), air.alpha, pilot.flaps, state) : plan.glider ? 0.35 : 1;
    else input.stick = plane.aux_on ? 0 : stick_for(plan, plane, rest_pose(c).pitch, air.alpha, pilot.flaps, state);
    return input;
  }

  if (ground && flight.landings > 0) {
    pilot.phase = Phase.ROLLOUT;
    pilot.pitch_target = plane.pitch;
    return step_pilot(plan, pilot, state);
  }

  const takeoff = scene.goal === Goal.TAKEOFF;
  let vs_target: number;
  let speed_target: number;

  if (pilot.phase === Phase.CLIMB) {
    speed_target = plan.climb;
    pilot.throttle = 1;
    if (agl > 60 && pilot.flaps > 0 && !takeoff) pilot.flaps = Math.max(0, pilot.flaps - DT * 0.1);
    vs_target = 99;
    if (!takeoff && agl >= plan.cruise_agl * 0.9) pilot.phase = Phase.CRUISE;
  } else if (pilot.phase === Phase.CRUISE) {
    speed_target = plan.cruise;
    vs_target = clamp((plane.h - ground_at(scene.course, plane.x) - plan.cruise_agl) * -0.1, -4, 4);
    if (plane.h >= path && d < 30000) pilot.phase = Phase.APPROACH;
  } else {
    speed_target = plan.approach;
    if (agl + plane.vy * plan.lead < plan.flare && d < 2500) {
      if (pilot.phase !== Phase.FLARE) pilot.flare_sink = Math.max(0.6, -plane.vy);
      pilot.phase = Phase.FLARE;
    }
    const sink = Math.max(1, ground_speed(plane)) * Math.tan(plan.slope);
    const high = plane.h - path;
    vs_target = d < 0 ? -sink : clamp(-sink - high * (s.engine === Engine.JET ? 0.06 : 0.12), -sink * 1.8 - 0.6, 1.5);
  }

  if (pilot.phase === Phase.FLARE) {
    const floor = s.engine === Engine.JET ? 0.7 : 0.3;
    vs_target = -(floor + (pilot.flare_sink - floor) * clamp((agl + plane.vy * plan.lead) / plan.flare, 0, 1));
    speed_target = 0;
  }

  const over = obstacle_ahead(scene, plane.x, Math.max(30, ground_speed(plane) * 4));
  if (over !== null && plane.h - s.length * 0.2 < over + 4) {
    vs_target = Math.max(vs_target, 1);
    if (pilot.phase === Phase.FLARE) pilot.phase = Phase.APPROACH;
  }

  const config = pilot.phase === Phase.APPROACH || pilot.phase === Phase.FLARE;
  if (config && V < stall_at(c, plan.land_flaps) * 1.6) pilot.flaps = Math.min(plan.land_flaps, pilot.flaps + DT * 0.2);

  // Without thrust the pitch holds the speed and the drag (airbrakes, else the flaps) holds the path; with it, the other way round.
  if (plan.unpowered && pilot.phase !== Phase.FLARE) {
    const high = plane.h - path;
    const on_path = pilot.phase === Phase.APPROACH && high > -15;
    const lift = env.updraft;
    const target = on_path ? plan.approach : lift > 0.4 ? stall_at(c, 0) * 1.15 : plan.glider ? stall_at(c, 0) * 1.35 + Math.max(0, -lift) * 3 : stall_at(c, pilot.flaps) * 1.45;
    pilot.speed_sum = clamp(pilot.speed_sum + (V - target) * DT, -40, 40);
    const drag = on_path ? clamp(0.4 + high / 8 + pilot.path_sum * 0.004, 0, 1) : 0;
    if (on_path) pilot.path_sum = clamp(pilot.path_sum + high * DT, -60, 60);
    if (s.spoiler_drag > 0) pilot.spoilers = drag;
    else if (scene.power === 0) pilot.flaps = on_path ? clamp(drag * plan.land_flaps * 1.3, 0, plan.land_flaps) : 0;
    const glide = pitch_for(plan, plane, target, 0, pilot.flaps, pilot.spoilers);
    const ratio = drag_coefficient(glide.alpha, (c.mass * G) / (0.5 * RHO * target * target * s.wing_area), pilot.flaps, 1, c, pilot.spoilers) / ((c.mass * G) / (0.5 * RHO * target * target * s.wing_area));
    vs_target = -V * ratio + (V - target) * 0.3 + pilot.speed_sum * 0.02;
    pilot.vs_sum = 0;
    pilot.throttle = 0;
  } else if (pilot.phase !== Phase.CLIMB) {
    if (pilot.phase === Phase.FLARE) pilot.throttle = 0;
    else {
      pilot.speed_sum = clamp(pilot.speed_sum + (speed_target - V) * DT, -30, 30);
      const k = s.engine === Engine.JET ? 0.08 : 0.15;
      pilot.throttle = clamp(0.35 + (speed_target - V) * k + pilot.speed_sum * k * 0.15, 0, 1);
    }
    if (s.spoiler_drag > 0 && !plan.unpowered) pilot.spoilers = pilot.phase === Phase.APPROACH && V > speed_target + 12 ? 1 : 0;
  } else {
    // Climbing at full power the pitch holds the climb speed.
    pilot.speed_sum = clamp(pilot.speed_sum + (V - speed_target) * DT, -30, 30);
    const floor = agl < 40 ? 1.5 : V > stall_at(c, pilot.flaps) * 1.12 ? 0.5 : -1;
    vs_target = Math.max(floor, (V - speed_target) * 0.8 + pilot.speed_sum * 0.08 + 2);
  }

  const margin = V - stall_at(c, pilot.flaps) * (pilot.phase === Phase.CLIMB ? 1.08 : 1.2);
  if (margin < 0 && pilot.phase !== Phase.FLARE) vs_target = Math.min(vs_target, plane.vy + margin * 1.5);
  pilot.vs_sum = clamp(pilot.vs_sum + (vs_target - plane.vy) * DT, -20, 20);
  const want = pitch_for(plan, plane, V, vs_target, pilot.flaps, pilot.spoilers);
  const raw = want.pitch + pilot.vs_sum * (s.engine === Engine.JET ? 0.002 : 0.01);
  const target = pilot.phase === Phase.FLARE ? Math.min(raw, plan.flare_pitch) : raw;
  input.throttle = pilot.throttle;
  input.flaps = pilot.flaps;
  input.spoilers = pilot.spoilers;
  input.stick = stick_for(plan, plane, target, want.alpha, pilot.flaps, state);
  pilot.pitch_target = target;
  pilot.stick = input.stick;
  return input;
}

/** Flies the scene in the real physics: takes off when it starts on the ground, then the glidepath and the flare, or climbs over the obstacle. */
/** The autopilot for a round from its start: each call reads the state and gives the controls for the next step. */
export function autopilot(scene: Scene, c: Coefficients, start: RoundState): { input: (state: RoundState) => Input; pilot: Pilot } {
  const plan = plan_for(scene, c);
  const cockpit = COCKPITS[c.spec.id as keyof typeof COCKPITS];
  const pilot: Pilot = {
    phase: scene.start.agl > 0 ? (scene.goal === Goal.TAKEOFF ? Phase.CLIMB : Phase.APPROACH) : Phase.ROLL,
    pitch_target: start.flight.plane.pitch,
    vs_sum: 0,
    speed_sum: 0,
    path_sum: 0,
    throttle: cockpit.detents[scene.start.lever_notch].throttle,
    spoilers: 0,
    flaps: cockpit.flaps[scene.start.flap_notch],
    flare_sink: 1,
    stick: 0,
  };
  if (pilot.phase === Phase.APPROACH && start.flight.plane.h < to_path_height(scene, plan, start.flight.plane.x) - 30) pilot.phase = Phase.CRUISE;
  return { input: (state) => step_pilot(plan, pilot, state), pilot };
}

export function fly(scene: Scene, base: Coefficients, watch?: (state: RoundState, pilot: Pilot) => void): Proof {
  const c = powered(base, scene);
  const cockpit = COCKPITS[c.spec.id as keyof typeof COCKPITS];
  const flaps = cockpit.flaps[scene.start.flap_notch];
  const throttle = cockpit.detents[scene.start.lever_notch].throttle;
  let state = create_round(scene, c, flaps, throttle);
  state = { ...state, flight: { ...state.flight, status: Status.FLYING } };
  const { input: drive, pilot } = autopilot(scene, c, state);
  for (let t = 0; t < TIME_LIMIT; t += DT) {
    const input = drive(state);
    state = step_round(state, input, c, DT);
    watch?.(state, pilot);
    if (state.flight.status === Status.DONE) return { ok: true, time: state.flight.time, sink: state.flight.touchdown?.sink, landings: state.flight.landings };
    if (state.flight.status === Status.CRASHED) return { ok: false, reason: `${state.failure}${state.flight.crash ? ` ${state.flight.crash.kind}` : ""} at ${Math.round(local(scene.course, state.flight.plane.x))} m, ${pilot.phase}`, time: state.flight.time };
  }
  return { ok: false, reason: "out of time" };
}

function to_path_height(scene: Scene, plan: Plan, x: number): number {
  return ground_at(scene.course, scene.strip.x0 + plan.aim) + Math.tan(plan.slope) * to_aim(scene, scene.strip, x, plan.aim);
}

/** Par from the autopilot's time, as in Harbour: ceil(1.4 t + 8) seconds, in ms. */
export function par_of(seconds: number): number {
  return Math.ceil(seconds * 1.4 + 8) * 1000;
}

