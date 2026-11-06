import { coefficients, Drive, type BoatSpec, type Coefficients } from "./boat";

export const BoatId = { RIB: "rib", YACHT: "yacht" } as const;
export type BoatId = (typeof BoatId)[keyof typeof BoatId];

export const BOAT_IDS = [BoatId.RIB, BoatId.YACHT] as const;

export const SPECS: Record<BoatId, BoatSpec> = {
  [BoatId.RIB]: {
    id: BoatId.RIB,
    name: "RIB",
    length: 4.5,
    beam: 2,
    mass: 700,
    drive: Drive.OUTBOARD,
    top_speed: 3,
    astern_speed: 1.8,
    thrust: 1200,
    carry: 6,
    grip: 4,
    turn_rate: 14,
    kick: 32,
    walk: 0,
    engine_lag: 0.3,
    gear_time: 0.4,
    rudder_time: 1.2,
    lock: 35,
    added: { surge: 0.08, sway: 0.5, yaw: 0.4 },
  },
  [BoatId.YACHT]: {
    id: BoatId.YACHT,
    name: "Yacht",
    length: 10,
    beam: 3.3,
    mass: 5500,
    drive: Drive.SHAFT,
    top_speed: 2.5,
    astern_speed: 1.6,
    thrust: 2000,
    carry: 18,
    grip: 20,
    turn_rate: 12,
    kick: 7,
    walk: 0.25,
    engine_lag: 0.5,
    gear_time: 0.6,
    rudder_time: 2,
    lock: 35,
    added: { surge: 0.05, sway: 0.9, yaw: 0.4 },
  },
};

const derived = new Map<BoatId, Coefficients>();

export function boat_coefficients(id: BoatId): Coefficients {
  let c = derived.get(id);
  if (!c) {
    c = coefficients(SPECS[id]);
    derived.set(id, c);
  }
  return c;
}
