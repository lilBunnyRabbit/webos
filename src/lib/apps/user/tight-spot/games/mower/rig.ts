import type { Pose } from "$kit/games/play2d/geometry";
import { MOWER, TRACTOR, trailer_pose, Vehicle, type Placement, type TrailerSpec, type VehicleSpec } from "../../core/vehicle";
import { deck_of, type Deck } from "./deck";

export const RigKind = { MOWER: "mower", TRACTOR: "tractor" } as const;
export type RigKind = (typeof RigKind)[keyof typeof RigKind];

/** A trailed gang mower: three reels on a 3 m frame behind the tractor's drawbar, riding on two wheels in the middle. */
export const GANG: TrailerSpec = {
  hitch: 0.9,
  axle: 2,
  drawbar: 0.9,
  box_length: 1.5,
  width: 3,
  track: 2.2,
  wheel_diameter: 0.5,
  wheel_width: 0.2,
  max_angle: (70 * Math.PI) / 180,
};

export const TRACTOR_GANG: VehicleSpec = { ...TRACTOR, max_forward: 4, hitches: [GANG] };

export interface Rig {
  kind: RigKind;
  vehicle: Vehicle;
  spec: VehicleSpec;
  /** The spec the vehicle alone is drawn with: the game draws a towed deck itself. */
  cab: VehicleSpec;
  deck: Deck;
  towed: boolean;
  span: number;
  /** Par: metres between passes, steady speed, and seconds per turn at the end of a pass, round an obstacle, off the patio. */
  pass: number;
  speed: number;
  turn: number;
  around: number;
  leave: number;
}

export const RIGS: Record<RigKind, Rig> = {
  mower: { kind: RigKind.MOWER, vehicle: Vehicle.MOWER, spec: MOWER, cab: MOWER, deck: deck_of(Vehicle.MOWER), towed: false, span: 16, pass: 1.2, speed: 2.6, turn: 4, around: 8, leave: 6 },
  tractor: {
    kind: RigKind.TRACTOR,
    vehicle: Vehicle.TRACTOR,
    spec: TRACTOR_GANG,
    cab: TRACTOR,
    deck: { front: GANG.axle - GANG.drawbar, rear: GANG.axle - GANG.drawbar - GANG.box_length, half: GANG.width / 2 },
    towed: true,
    span: 24,
    pass: 2.7,
    speed: 3,
    turn: 9,
    around: 12,
    leave: 8,
  },
};

export function cutter(car: Placement, rig: Rig, spec: VehicleSpec = rig.spec): Pose {
  return rig.towed ? trailer_pose(car, spec, 0) : car;
}
