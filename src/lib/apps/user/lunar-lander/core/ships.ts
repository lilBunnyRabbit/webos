import { BodyId } from "./bodies";
import { coefficients, Steering, type Coefficients, type ShipSpec } from "./lander";

export const ShipId = { LANDER: "lander", PODS: "pods", SHUTTLE: "shuttle" } as const;
export type ShipId = (typeof ShipId)[keyof typeof ShipId];

export const SHIP_IDS = [ShipId.LANDER, ShipId.PODS, ShipId.SHUTTLE] as const;

export const SPECS: Record<ShipId, ShipSpec> = {
  [ShipId.LANDER]: {
    id: ShipId.LANDER,
    name: "Lander",
    mass: 4000,
    gyration: 1.6,
    hover: { [BodyId.MOON]: 0.4, [BodyId.MARS]: 0.55, [BodyId.EARTH]: 0.65 },
    spin: 30,
    spin_up: 1.2,
    steering: Steering.RCS,
    engines: [{ x: 0, z: -1.5 }],
    safe: { sink: 2.5, slide: 1.2, tilt: 12 },
    tank: 200,
    spool: 0.35,
    feet: [
      { x: -3.1, z: -2.6 },
      { x: 3.1, z: -2.6 },
    ],
    travel: 0.45,
    hull: [
      { x: -2.1, z: -1.3 },
      { x: 2.1, z: -1.3 },
      { x: 2.3, z: 0.4 },
      { x: 1.5, z: 2.4 },
      { x: -1.5, z: 2.4 },
      { x: -2.3, z: 0.4 },
      { x: 0, z: -2.0 },
    ],
    drag_area: 14,
  },
  [ShipId.PODS]: {
    id: ShipId.PODS,
    name: "Twin pods",
    mass: 2200,
    gyration: 2.4,
    hover: { [BodyId.MOON]: 0.45, [BodyId.MARS]: 0.55, [BodyId.EARTH]: 0.62 },
    spin: 32,
    spin_up: 1.4,
    steering: Steering.SPLIT,
    engines: [
      { x: -3.2, z: -1.3 },
      { x: 3.2, z: -1.3 },
    ],
    safe: { sink: 2.0, slide: 1.0, tilt: 10 },
    tank: 150,
    spool: 0.2,
    feet: [
      { x: -3.7, z: -2.3 },
      { x: 3.7, z: -2.3 },
    ],
    travel: 0.4,
    hull: [
      { x: -4.1, z: -1.2 },
      { x: -2.3, z: -1.2 },
      { x: -2.3, z: 1.1 },
      { x: -4.1, z: 1.1 },
      { x: 4.1, z: -1.2 },
      { x: 2.3, z: -1.2 },
      { x: 2.3, z: 1.1 },
      { x: 4.1, z: 1.1 },
      { x: -1.0, z: 1.7 },
      { x: 1.0, z: 1.7 },
      { x: 0, z: -0.4 },
    ],
    drag_area: 16,
  },
  [ShipId.SHUTTLE]: {
    id: ShipId.SHUTTLE,
    name: "Shuttle",
    mass: 12000,
    gyration: 3.5,
    hover: { [BodyId.MOON]: 0.45, [BodyId.MARS]: 0.6, [BodyId.EARTH]: 0.7 },
    spin: 14,
    spin_up: 2.6,
    steering: Steering.RCS,
    engines: [
      { x: -2.4, z: -1.8 },
      { x: 2.4, z: -1.8 },
    ],
    safe: { sink: 3.0, slide: 1.5, tilt: 15 },
    tank: 260,
    spool: 0.8,
    feet: [
      { x: -5.4, z: -3.1 },
      { x: 5.4, z: -3.1 },
    ],
    travel: 0.6,
    hull: [
      { x: -6.6, z: -1.6 },
      { x: 6.6, z: -1.6 },
      { x: 7.0, z: 0.3 },
      { x: 5.6, z: 1.9 },
      { x: -5.6, z: 1.9 },
      { x: -7.0, z: 0.3 },
      { x: -2.4, z: -2.4 },
      { x: 2.4, z: -2.4 },
    ],
    drag_area: 40,
  },
};

const derived = new Map<ShipId, Coefficients>();

export function ship_coefficients(id: ShipId): Coefficients {
  let c = derived.get(id);
  if (!c) {
    c = coefficients(SPECS[id]);
    derived.set(id, c);
  }
  return c;
}
