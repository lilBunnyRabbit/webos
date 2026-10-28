import type { Polygon, Pose, Vec } from "./geometry";
import type { Vehicle } from "./vehicle";

export const Scenario = {
  PARALLEL: "parallel",
  FORWARD: "forward",
  REVERSE: "reverse",
  ANGLED: "angled",
  GARAGE: "garage",
  PILLARS: "pillars",
  NARROW: "narrow",
  DOOR: "door",
  DEAD_END: "dead-end",
  END_BAY: "end-bay",
  BUS_STOP: "bus-stop",
  DEPOT: "depot",
  DRIVEWAY: "driveway",
  SLIPWAY: "slipway",
} as const;
export type Scenario = (typeof Scenario)[keyof typeof Scenario];
export const SCENARIOS: readonly Scenario[] = Object.values(Scenario);

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

export const ChunkKind = { ROAD: "road", LOT: "lot" } as const;
export type ChunkKind = (typeof ChunkKind)[keyof typeof ChunkKind];

export interface Layout {
  surfaces: Surface[];
  solids: Solid[];
  marks: Mark[];
  bays: Bay[];
  /** Where the car waits when the lot has its own start instead of the street leading in. */
  start?: Pose;
}
