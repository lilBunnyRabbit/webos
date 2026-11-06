import type { Bay } from "$kit/games/play2d/precision";
import type { Polygon, Pose, Vec } from "$kit/games/play2d/geometry";
import type { Vehicle } from "./vehicle";

export const SolidKind = {
  CAR: "car",
  WALL: "wall",
  PILLAR: "pillar",
  KERB: "kerb",
  SHELF: "shelf",
  WATER: "water",
  POST: "post",
  RACK: "rack",
  PALLET: "pallet",
  HEDGE: "hedge",
} as const;
export type SolidKind = (typeof SolidKind)[keyof typeof SolidKind];

export interface Solid {
  kind: SolidKind;
  shape: Polygon;
  car?: { pose: Pose; length: number; width: number; paint: number; vehicle?: Vehicle };
}

export type { Bay };

export const MarkKind = { LINE: "line", DASH: "dash", STOP: "stop" } as const;
export type MarkKind = (typeof MarkKind)[keyof typeof MarkKind];

export interface Mark {
  kind: MarkKind;
  a: Vec;
  b: Vec;
}

export const SurfaceKind = { ASPHALT: "asphalt", FLOOR: "floor", PAVEMENT: "pavement", GRASS: "grass", GARAGE: "garage", RAMP: "ramp" } as const;
export type SurfaceKind = (typeof SurfaceKind)[keyof typeof SurfaceKind];

export interface Surface {
  kind: SurfaceKind;
  shape: Polygon;
}

export interface Portal {
  /** Just past the crossed line and deeper than one step of travel, so a step can't jump it. */
  mouth: Polygon;
  heading: number;
  from: Pose;
  to: Pose;
  /** Where a driver lines up on the way to a mouth round a bend, in order: a search aims at each in turn. */
  lead?: readonly Pose[];
}
