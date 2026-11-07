import type { Vec } from "$kit/games/play2d/geometry";
import { BODIES, type BodyId } from "./bodies";
import { advance, create_flight, feet_x, Status, type Flight } from "./flight";
import { create_ship, type Coefficients, type Env, type Input, type Ship } from "./lander";
import type { ShipId } from "./ships";
import { ground_at, pad_under, wind_at, type Terrain, type Weather } from "./world";

export interface Stop {
  pad: number;
  /** Kilograms loaded once the ship has settled on the pad: positive picks up, negative drops off. */
  load: number;
  /** What waits on the pad, for the drawing: a crate, crew, or nothing. */
  cargo: CargoKind | null;
  /** Waypoints the autopilot flies through on the way to this pad, through caves and over ridges. */
  route: Vec[];
}

export const CargoKind = { CRATE: "crate", CREW: "crew" } as const;
export type CargoKind = (typeof CargoKind)[keyof typeof CargoKind];

export interface Scene {
  body: BodyId;
  ship: ShipId;
  terrain: Terrain;
  weather: Weather;
  start: { x: number; agl: number; vx: number; cargo: number };
  stops: Stop[];
}

export interface MissionState {
  scene: Scene;
  flight: Flight;
  /** The stop flown to now. */
  stop: number;
  /** Seconds settled on its pad so far. */
  held: number;
}

export const HOLD = 1;
export const LOAD_HOLD = 3;
const SETTLED_SPEED = 0.15;

export function env_of(scene: Scene, ship: Pick<Ship, "x">, time: number, infinite_fuel = false): Env {
  const terrain = scene.terrain;
  return { body: BODIES[scene.body], wind: wind_at(scene.weather, ship.x, time), ground: (x) => ground_at(terrain, x), infinite_fuel };
}

export function start_ship(scene: Scene, c: Coefficients): Ship {
  const { x, agl, vx, cargo } = scene.start;
  return { ...create_ship(c, x, ground_at(scene.terrain, x) + agl, cargo), vx };
}

export function create_mission(scene: Scene, c: Coefficients): MissionState {
  return { scene, flight: create_flight(start_ship(scene, c), Status.READY), stop: 0, held: 0 };
}

export function settled_on(ship: Ship, c: Coefficients, terrain: Terrain): number {
  if (!ship.on.every(Boolean) || Math.hypot(ship.vx, ship.vy) > SETTLED_SPEED || Math.abs(ship.spin) > 0.03) return -1;
  return pad_under(terrain, feet_x(ship, c));
}

export function step_mission(state: MissionState, input: Input, c: Coefficients, dt: number): MissionState {
  if (state.flight.status !== Status.FLYING) return state;
  const { scene } = state;
  const flight = advance(state.flight, input, c, dt, env_of(scene, state.flight.ship, state.flight.time), scene.terrain);
  if (flight.status !== Status.FLYING) return { ...state, flight };
  const stop = scene.stops[state.stop];
  const held = settled_on(flight.ship, c, scene.terrain) === stop.pad ? state.held + dt : 0;
  if (held < (stop.load ? LOAD_HOLD : HOLD)) return { ...state, flight, held };
  const ship = { ...flight.ship, cargo: Math.max(0, flight.ship.cargo + stop.load) };
  const next = state.stop + 1;
  if (next >= scene.stops.length) return { ...state, flight: { ...flight, ship, status: Status.DONE }, stop: next, held: 0 };
  return { ...state, flight: { ...flight, ship }, stop: next, held: 0 };
}

export interface Result {
  stars: number;
  gentle: boolean;
  on_time: boolean;
  ms: number;
}

/** Done, gentle (one kiss on each pad, no bounce, no other touchdown) and under par. */
export function result(state: MissionState, par: number | null): Result {
  const { flight, scene } = state;
  const gentle = !flight.rough && flight.landings === scene.stops.length;
  const ms = Math.round(flight.time * 1000);
  const on_time = par !== null && ms <= par;
  return { stars: 1 + (gentle ? 1 : 0) + (on_time ? 1 : 0), gentle, on_time, ms };
}
