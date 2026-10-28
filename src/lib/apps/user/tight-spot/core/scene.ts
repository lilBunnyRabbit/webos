import type { Polygon, Pose, Vec } from "./geometry";
import type { Vehicle } from "./vehicle";

export const SolidKind = {
  CAR: "car",
  WALL: "wall",
  PILLAR: "pillar",
  KERB: "kerb",
  SHELF: "shelf",
  WATER: "water",
  POST: "post",
} as const;
export type SolidKind = (typeof SolidKind)[keyof typeof SolidKind];

export interface Solid {
  kind: SolidKind;
  shape: Polygon;
  car?: { pose: Pose; length: number; width: number; paint: number; vehicle?: Vehicle };
}

export interface Bay {
  shape: Polygon;
  /** The way the car's nose must point; with `either` the opposite way counts too. */
  heading: number;
  either: boolean;
}

export const MarkKind = { LINE: "line", DASH: "dash", STOP: "stop" } as const;
export type MarkKind = (typeof MarkKind)[keyof typeof MarkKind];

export interface Mark {
  kind: MarkKind;
  a: Vec;
  b: Vec;
}

export const SurfaceKind = { ASPHALT: "asphalt", FLOOR: "floor", PAVEMENT: "pavement" } as const;
export type SurfaceKind = (typeof SurfaceKind)[keyof typeof SurfaceKind];

export interface Surface {
  kind: SurfaceKind;
  shape: Polygon;
}
