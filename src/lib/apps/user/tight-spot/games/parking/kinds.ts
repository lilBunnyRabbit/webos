
export * from "../../core/scene";
export type { Layout } from "../../core/lot-layout";

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
  UNDERGROUND: "underground",
  MULTI_STOREY: "multi-storey",
} as const;
export type Scenario = (typeof Scenario)[keyof typeof Scenario];
export const SCENARIOS: readonly Scenario[] = Object.values(Scenario);

/** Here rather than in `game.ts` so the yard's doorway can name a mode without loading the game. */
export const Mode = { SCENARIO: "scenario", LEVELS: "levels", OPEN: "open", EXTREME: "extreme" } as const;
export type Mode = (typeof Mode)[keyof typeof Mode];
