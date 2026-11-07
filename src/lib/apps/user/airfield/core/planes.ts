import { coefficients, type Coefficients, type PlaneSpec } from "./plane";

export const PlaneId = { TRAINER: "trainer" } as const;
export type PlaneId = (typeof PlaneId)[keyof typeof PlaneId];

export const PLANE_IDS = [PlaneId.TRAINER] as const;

export const SPECS: Record<PlaneId, PlaneSpec> = {
  [PlaneId.TRAINER]: {
    id: PlaneId.TRAINER,
    name: "Trainer",
    mass: 600,
    wing_area: 16.6,
    span: 10.7,
    chord: 1.6,
    length: 6.8,
    incidence: 2,
    zero_lift: -3,
    oswald: 0.75,
    stall_speed: 18,
    flap_stall: 16,
    glide: 8,
    climb: 3,
    cruise: 34,
    trim_speed: 25,
    pitch_rate: 30,
    rollout: 120,
    gear_drag: 0.01,
    flap_drag: 0.045,
    flap_pitch: -0.03,
    idle: 0.05,
    engine_lag: 0.6,
    elevator_lag: 0.12,
    flap_time: 4,
    prop_radius: 0.9,
    gear: { main: { x: 0.35, z: -1.0 }, tail: { x: -4.6, z: -0.2 } },
    prop: { x: 1.9, z: -0.75 },
    wing: { x: 0, z: 0.9 },
    hull: [
      { x: 1.9, z: 0.55 },
      { x: 0.3, z: 1.25 },
      { x: -4.5, z: 1.3 },
      { x: -4.8, z: 0.1 },
    ],
  },
};

const derived = new Map<PlaneId, Coefficients>();

export function plane_coefficients(id: PlaneId): Coefficients {
  let c = derived.get(id);
  if (!c) {
    c = coefficients(SPECS[id]);
    derived.set(id, c);
  }
  return c;
}
