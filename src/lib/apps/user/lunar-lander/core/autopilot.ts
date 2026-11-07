import { BODIES } from "./bodies";
import { airborne, Status } from "./flight";
import { DEG, feet_height, mass_of, type Coefficients, type Input } from "./lander";
import { create_mission, env_of, step_mission, type MissionState, type Scene } from "./mission";
import { ground_at, highest_between } from "./world";

export interface Pilot {
  stop: number;
  waypoint: number;
  descending: boolean;
}

const DT = 1 / 120;
const LIMIT = 900;
const VX_MAX = 20;
const VY_MAX = 6;
const TILT_MAX = 35 * DEG;
const NEAR_GROUND_TILT = 2 * DEG;
const FINAL_TILT = 15 * DEG;
const TURN_DEADBAND = 1 * DEG;
const CLEARANCE = 10;
const WAYPOINT_RADIUS = 12;
const HOVER_OVER_PAD = 14;
const CRUISE = 22;

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}

/** A speed toward `distance` that can still stop there with `brake` m/s² to spare. */
function approach(distance: number, brake: number, max: number, gain: number): number {
  const d = Math.abs(distance);
  return Math.sign(distance) * Math.min(max, Math.sqrt(2 * brake * d), gain * d);
}

export function create_pilot(): Pilot {
  return { stop: -1, waypoint: 0, descending: false };
}

/**
 * Flies the mission the way a careful pilot would, in the real physics: through each stop's waypoints, to a hover over
 * the pad, then straight down at a kiss. The throttle is continuous where a player has detents; par is lenient anyway.
 */
export function autopilot(state: MissionState, c: Coefficients, pilot: Pilot): Input {
  const { scene, flight } = state;
  const ship = flight.ship;
  if (state.stop >= scene.stops.length) return { throttle: 0, turn: 0 };
  if (pilot.stop !== state.stop) {
    pilot.stop = state.stop;
    pilot.waypoint = 0;
    pilot.descending = false;
  }
  const stop = scene.stops[state.stop];
  const pad = scene.terrain.pads[stop.pad];
  const env = env_of(scene, ship, flight.time);
  const body = BODIES[scene.body];
  const g = body.g;
  const m = mass_of(ship, c);
  const T = c.thrust[body.id];
  const low = Math.min(...c.spec.feet.map((f) => f.z));
  const feet = feet_height(ship, c, env);

  const on_pad = !airborne(ship) && ship.x > pad.x0 && ship.x < pad.x1;
  if (on_pad && state.held > 0) return { throttle: 0, turn: 0 };

  let vx_want: number;
  let vy_want: number;
  let tilt_max = TILT_MAX;
  const brake_x = 0.5 * Math.min(g * Math.tan(TILT_MAX), 3);
  const brake_y = 0.35 * g * Math.min(1, T / (m * g) - 1);
  const route = stop.route;
  while (pilot.waypoint < route.length && Math.hypot(route[pilot.waypoint].x - ship.x, route[pilot.waypoint].y - ship.y) < WAYPOINT_RADIUS) pilot.waypoint++;
  const pad_x = (pad.x0 + pad.x1) / 2;
  if (pilot.waypoint < route.length) {
    const wp = route[pilot.waypoint];
    vx_want = approach(wp.x - ship.x, brake_x, VX_MAX, 0.25);
    vy_want = approach(wp.y - ship.y, brake_y, VY_MAX, 0.3);
  } else {
    const dx = pad_x - ship.x;
    vx_want = approach(dx, brake_x, VX_MAX, 0.25);
    if (Math.abs(dx) < 1.5 && Math.abs(ship.vx) < 0.6) pilot.descending = true;
    else if (Math.abs(dx) > 6) pilot.descending = false;
    if (pilot.descending) vy_want = -Math.min(VY_MAX * 0.6, 0.3 + 0.28 * Math.max(0, feet));
    else {
      const cruise = Math.abs(dx) > 30 ? highest_between(scene.terrain, ship.x, pad_x) - low + CRUISE : -Infinity;
      vy_want = approach(Math.max(pad.y - low + HOVER_OVER_PAD, cruise) - ship.y, brake_y, VY_MAX, 0.3);
    }
  }

  // Below a rise ahead the ship slows until it has climbed over it, rather than racing the climb.
  const heading = Math.sign(vx_want);
  const goal_x = pilot.waypoint < route.length ? route[pilot.waypoint].x : pad_x;
  if (heading !== 0 && Math.abs(goal_x - ship.x) > 2) {
    const rise = highest_between(scene.terrain, ship.x, ship.x + heading * Math.min(150, Math.abs(goal_x - ship.x))) - low;
    const margin = ship.y - rise - 8;
    if (margin < 0) vx_want = heading * Math.min(Math.abs(vx_want), Math.max(1.5, VX_MAX * (1 + margin / 20)));
  }
  if (feet < 14) tilt_max = Math.min(tilt_max, clamp((feet / 14) * FINAL_TILT, NEAR_GROUND_TILT, FINAL_TILT));
  if (feet < 4 && Math.abs(ship.angle) > 6 * DEG) vy_want = Math.max(vy_want, 0);

  // Never into the ground ahead: the next few seconds' highest point, plus room for the legs.
  const ahead = ship.x + clamp(ship.vx * 4, -80, 80);
  const top = highest_between(scene.terrain, Math.min(ship.x, ahead) - 8, Math.max(ship.x, ahead) + 8);
  const descending = pilot.waypoint >= route.length && Math.abs(pad_x - ship.x) < 30;
  if (!descending && ship.y + low - top < CLEARANCE) vy_want = Math.max(vy_want, 2.5);

  // The tilt takes time to come round, so the lateral loop leads on the push the current tilt already gives.
  const push = (-Math.sin(ship.angle) * ship.spool * T) / m;
  const lead = 0.25 + (0.25 * TILT_MAX) / (c.spec.spin * DEG);
  const reach = Math.min(g * Math.tan(tilt_max), 2.2);
  let ax = clamp(0.5 * Math.min(1, c.spec.spin / 30) * (vx_want - (ship.vx + push * lead)), -reach, reach);
  if (env.body.rho > 0) ax += (0.5 * env.body.rho * Math.abs(ship.vx - env.wind) * (ship.vx - env.wind) * c.spec.drag_area) / m;
  const ay = clamp(1.6 * (vy_want - ship.vy), -0.5 * g, 0.6 * g);
  const tilt = clamp(-Math.atan(ax / g), -tilt_max, tilt_max);
  const throttle = clamp((m * (ay + g)) / Math.max(0.3, Math.cos(ship.angle)) / T, 0, 1);
  // The fastest turn that still stops on the tilt wanted: a slow-turning ship overshot it by tens of degrees.
  // A player's turn is a key: left, right or let go (the rate hold stops it). So is the autopilot's: it lets go once
  // the turn under way would carry it onto the tilt wanted.
  const spin_accel = (0.8 * c.spec.spin * DEG) / c.spec.spin_up;
  const coast = (ship.spin * Math.abs(ship.spin)) / (2 * spin_accel);
  const error = tilt - (ship.angle + coast);
  // A degree of lean pushes six times harder on Earth than on the Moon, so the band left alone shrinks with g.
  const band = Math.max(0.25 * DEG, Math.min(TURN_DEADBAND, 0.06 / g));
  return { throttle, turn: Math.abs(error) > band ? Math.sign(error) : 0 };
}

export interface Proof {
  ok: boolean;
  time?: number;
  reason?: string;
}

export function fly(scene: Scene, c: Coefficients): Proof {
  let state = create_mission(scene, c);
  state = { ...state, flight: { ...state.flight, status: Status.FLYING } };
  const pilot = create_pilot();
  while (state.flight.status === Status.FLYING && state.flight.time < LIMIT) state = step_mission(state, autopilot(state, c, pilot), c, DT);
  const f = state.flight;
  if (f.status === Status.DONE) return { ok: true, time: f.time };
  const at = `x ${f.ship.x.toFixed(0)}, ${(f.ship.y - ground_at(scene.terrain, f.ship.x)).toFixed(0)} m up, stop ${state.stop + 1}`;
  if (f.status === Status.CRASHED) return { ok: false, reason: `crashed (${f.crash?.kind}) at ${at}, ${f.crash?.sink.toFixed(2)} m/s, fuel ${f.ship.fuel.toFixed(0)} s` };
  return { ok: false, reason: `not down after ${Math.round(f.time)} s at ${at}, fuel ${f.ship.fuel.toFixed(0)} s` };
}
