import { coefficients, Drive, type BoatSpec, type Coefficients } from "./boat";

export const BoatId = { RIB: "rib", YACHT: "yacht", CARGO: "cargo" } as const;
export type BoatId = (typeof BoatId)[keyof typeof BoatId];

export const BOAT_IDS = [BoatId.RIB, BoatId.YACHT, BoatId.CARGO] as const;

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
    grip: 12,
    turn_rate: 7,
    kick: 22,
    walk: 0,
    engine_lag: 0.3,
    gear_time: 0.4,
    rudder_time: 2.4,
    lock: 35,
    added: { surge: 0.08, sway: 0.5, yaw: 0.8 },
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
    grip: 40,
    turn_rate: 1.8,
    kick: 8,
    walk: 0.25,
    engine_lag: 0.5,
    gear_time: 0.6,
    rudder_time: 3,
    lock: 35,
    added: { surge: 0.05, sway: 0.9, yaw: 1 },
  },
  [BoatId.CARGO]: {
    id: BoatId.CARGO,
    name: "Coaster",
    length: 45,
    beam: 8.5,
    mass: 800_000,
    drive: Drive.SHAFT,
    cargo: true,
    top_speed: 4,
    astern_speed: 2.4,
    thrust: 60_000,
    carry: 120,
    grip: 150,
    turn_rate: 0.35,
    kick: 0.8,
    walk: 0.15,
    engine_lag: 2.5,
    gear_time: 3,
    rudder_time: 12,
    lock: 35,
    added: { surge: 0.05, sway: 0.9, yaw: 1 },
    thrusters: { turn: 1.2, lag: 1.5 },
  },
};

const derived = new Map<BoatId, Coefficients>();

export function next_boat(id: BoatId): BoatId {
  return BOAT_IDS[(BOAT_IDS.indexOf(id) + 1) % BOAT_IDS.length];
}

export function spec_coefficients(spec: BoatSpec): Coefficients {
  return boat_coefficients(spec.id as BoatId);
}

export function boat_coefficients(id: BoatId): Coefficients {
  let c = derived.get(id);
  if (!c) {
    c = coefficients(SPECS[id]);
    derived.set(id, c);
  }
  return c;
}
