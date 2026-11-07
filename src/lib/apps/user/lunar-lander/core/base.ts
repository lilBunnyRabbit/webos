import { RoundKind } from "$kit/games/play2d/rounds";
import { BODIES, type BodyId, type Body } from "./bodies";
import { feet_x } from "./flight";
import type { Coefficients, Env, Ship } from "./lander";
import { settled_on } from "./mission";
import { MISSIONS } from "./missions";
import { ground_at, hill, mesa, pad_under, terrain, wind_at, type Terrain, type Weather } from "./world";

export type GateId = number | typeof RoundKind.RANDOM | typeof RoundKind.DAILY;

export interface Gate {
  id: GateId;
  pad: number;
  x: number;
}

export interface Base {
  terrain: Terrain;
  /** The pad in front of the hangar: standing on it opens the picker. */
  hangar_pad: number;
  hangar: { x0: number; x1: number; height: number };
  gates: Gate[];
}

const FIRST_GATE = 60;
const GATE_STEP = 55;
const PAD_WIDTH = 20;

export function build_base(): Base {
  const ids: GateId[] = [...MISSIONS.map((mission) => mission.n), RoundKind.RANDOM, RoundKind.DAILY];
  const xs = ids.map((_, i) => FIRST_GATE + i * GATE_STEP);
  const end = xs[xs.length - 1] + 160;
  const t = terrain({
    x0: -320,
    x1: end,
    features: [mesa(-320, -230, 70, 50), hill(end - 30, 160, 90), ...xs.slice(0, -1).map((x, i) => hill(x + GATE_STEP / 2, 26, 2 + (i % 3)))],
    pads: [{ x: -60, width: 26 }, ...xs.map((x) => ({ x, width: PAD_WIDTH, y: 0 }))],
  });
  return { terrain: { ...t, soft_edges: true }, hangar_pad: 0, hangar: { x0: -150, x1: -88, height: 22 }, gates: ids.map((id, i) => ({ id, pad: i + 1, x: xs[i] })) };
}

export const BASE_START = -60;

/** The base's air and wind follow the free-flight switches: no air leaves a vacuum on any body. */
export function base_body(body: BodyId, air: boolean): Body {
  const real = BODIES[body];
  return air ? real : { ...real, rho: 0 };
}

export const BASE_WEATHER: Weather = { wind: 5, gust: 4, seed: 3 };

export function base_env(base: Base, body: Body, wind: boolean, ship: Pick<Ship, "x">, time: number, infinite_fuel: boolean): Env {
  return { body, wind: wind && body.rho > 0 ? wind_at(BASE_WEATHER, ship.x, time) : 0, ground: (x) => ground_at(base.terrain, x), infinite_fuel };
}

/** The gate whose pad the ship has settled on. */
export function at_gate(base: Base, ship: Ship, c: Coefficients): Gate | null {
  const pad = settled_on(ship, c, base.terrain);
  return pad < 0 ? null : (base.gates.find((gate) => gate.pad === pad) ?? null);
}

export function on_hangar_pad(base: Base, ship: Ship, c: Coefficients): boolean {
  return ship.on.some(Boolean) && pad_under(base.terrain, feet_x(ship, c)) === base.hangar_pad;
}
