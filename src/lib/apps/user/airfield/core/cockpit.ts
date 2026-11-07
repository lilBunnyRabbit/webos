import { REVERSE_THROTTLE } from "./plane";
import { PlaneId } from "./planes";

/** One notch of the lever: what the engine, the spoilers and the reverser do there. */
export interface Detent {
  label: string;
  name: string;
  throttle: number;
  spoilers: number;
  reverse: number;
}

export interface Cockpit {
  /** Bottom to top, as the lever reads. */
  detents: readonly Detent[];
  /** The resting notch: idle, or a glider's airbrakes in. Above it the lever shows power, below it drag. */
  idle: number;
  flaps: readonly number[];
  flap_names: readonly string[];
}

function power(throttle: number, label: string, name: string): Detent {
  return { label, name, throttle, spoilers: 0, reverse: 0 };
}

const PROP_DETENTS = [power(0, "Idle", "Idle"), power(0.25, "¼", "Quarter"), power(0.5, "½", "Half"), power(0.75, "¾", "Cruise"), power(1, "Full", "Full")];

export const COCKPITS: Record<PlaneId, Cockpit> = {
  [PlaneId.TRAINER]: { detents: PROP_DETENTS, idle: 0, flaps: [0, 0.5, 1], flap_names: ["Up", "Half", "Full"] },
  [PlaneId.STOL]: { detents: PROP_DETENTS, idle: 0, flaps: [0, 1 / 3, 2 / 3, 1], flap_names: ["Up", "1", "2", "Full"] },
  [PlaneId.AIRLINER]: {
    detents: [
      { label: "Rev", name: "Reverse", throttle: REVERSE_THROTTLE, spoilers: 1, reverse: 1 },
      { label: "Spl", name: "Spoilers", throttle: 0, spoilers: 1, reverse: 0 },
      ...PROP_DETENTS.slice(0, 3),
      power(0.75, "¾", "Cruise"),
      power(1, "TOGA", "Takeoff"),
    ],
    idle: 2,
    flaps: [0, 0.25, 0.5, 0.75, 1],
    flap_names: ["Up", "1", "2", "3", "Full"],
  },
  [PlaneId.GLIDER]: {
    detents: [
      { label: "Out", name: "Airbrakes out", throttle: 0, spoilers: 1, reverse: 0 },
      { label: "½", name: "Airbrakes half", throttle: 0, spoilers: 0.5, reverse: 0 },
      { label: "In", name: "Airbrakes in", throttle: 0, spoilers: 0, reverse: 0 },
    ],
    idle: 2,
    flaps: [0],
    flap_names: ["None"],
  },
};
