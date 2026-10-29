import type { Pose } from "../../core/geometry";
import type { Bay, Mark, Solid, Surface } from "../../core/scene";

export * from "../../core/scene";

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
  CAMPING: "camping",
  LOADING_DOCK: "loading-dock",
} as const;
export type Scenario = (typeof Scenario)[keyof typeof Scenario];
export const SCENARIOS: readonly Scenario[] = Object.values(Scenario);

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
