import { z } from "zod";

export interface Point {
  x: number;
  y: number;
}

export const Control = { LEFT: "left", RIGHT: "right", UP: "up", BOOST: "boost" } as const;
export type Control = (typeof Control)[keyof typeof Control];

export type Controls = Record<Control, boolean>;

export const NO_CONTROLS: Controls = { left: false, right: false, up: false, boost: false };

export const ThrusterKind = { MAIN: "main", LIGHT: "light" } as const;
export type ThrusterKind = (typeof ThrusterKind)[keyof typeof ThrusterKind];

/** Ship-local coordinates: origin at the centre of mass, x right, y down, upright at angle 0. */
export interface Thruster {
  at: Point;
  /** Unit vector the thruster pushes the ship, opposite to its exhaust. */
  dir: Point;
  power: number;
  burn: number;
  kind: ThrusterKind;
  controls: readonly Control[];
}

export const ShipId = { LANDER: "lander", PODS: "pods", SHUTTLE: "shuttle" } as const;
export type ShipId = (typeof ShipId)[keyof typeof ShipId];

export const ship_id_schema = z.enum(ShipId);

export interface ShipDesign {
  id: ShipId;
  name: string;
  /** Thrust and air push divide by this, so a heavy ship answers its engines and the wind slowly. */
  mass: number;
  inertia: number;
  /** Fraction of spin lost per second, so a tap doesn't spin forever. */
  spin_damping: number;
  hull: readonly Point[];
  feet: readonly Point[];
  thrusters: readonly Thruster[];
  help: string;
}

const LANDER: ShipDesign = {
  id: ShipId.LANDER,
  name: "Lander",
  mass: 1,
  inertia: 12,
  spin_damping: 2.5,
  hull: [
    { x: -4, y: -8 },
    { x: 4, y: -8 },
    { x: 6, y: -4 },
    { x: 6, y: 2 },
    { x: -6, y: 2 },
    { x: -6, y: -4 },
  ],
  feet: [
    { x: -8, y: 7 },
    { x: 8, y: 7 },
  ],
  thrusters: [
    { at: { x: 0, y: 4 }, dir: { x: 0, y: -1 }, power: 78, burn: 6, kind: ThrusterKind.MAIN, controls: [Control.UP, Control.BOOST] },
    { at: { x: -7.5, y: -5 }, dir: { x: 1, y: 0 }, power: 7, burn: 1, kind: ThrusterKind.LIGHT, controls: [Control.LEFT] },
    { at: { x: 7.5, y: -5 }, dir: { x: -1, y: 0 }, power: 7, burn: 1, kind: ThrusterKind.LIGHT, controls: [Control.RIGHT] },
  ],
  help: "↑ main engine · ←/→ side thrusters",
};

const PODS: ShipDesign = {
  id: ShipId.PODS,
  name: "Twin pods",
  mass: 1,
  inertia: 60,
  spin_damping: 1.8,
  hull: [
    { x: -3, y: -11 },
    { x: 3, y: -11 },
    { x: 4, y: -5 },
    { x: 9, y: -4 },
    { x: 9, y: 4 },
    { x: 4, y: 3 },
    { x: -4, y: 3 },
    { x: -9, y: 4 },
    { x: -9, y: -4 },
    { x: -4, y: -5 },
  ],
  feet: [
    { x: -6, y: 9 },
    { x: 6, y: 9 },
  ],
  thrusters: [
    { at: { x: -7, y: 5 }, dir: { x: 0, y: -1 }, power: 38, burn: 5, kind: ThrusterKind.MAIN, controls: [Control.LEFT, Control.UP, Control.BOOST] },
    { at: { x: 7, y: 5 }, dir: { x: 0, y: -1 }, power: 38, burn: 5, kind: ThrusterKind.MAIN, controls: [Control.RIGHT, Control.UP, Control.BOOST] },
  ],
  help: "←/→ left or right engine · ↑ both",
};

const SHUTTLE: ShipDesign = {
  id: ShipId.SHUTTLE,
  name: "Shuttle",
  mass: 4,
  inertia: 1870,
  spin_damping: 0.6,
  hull: [
    { x: -28, y: -5 },
    { x: 18, y: -5 },
    { x: 30, y: 0 },
    { x: 18, y: 5 },
    { x: -28, y: 5 },
  ],
  feet: [
    { x: -22, y: 9 },
    { x: 20, y: 9 },
  ],
  thrusters: [
    { at: { x: -15, y: 6 }, dir: { x: 0, y: -1 }, power: 146, burn: 5, kind: ThrusterKind.MAIN, controls: [Control.LEFT, Control.UP] },
    { at: { x: 15, y: 6 }, dir: { x: 0, y: -1 }, power: 146, burn: 5, kind: ThrusterKind.MAIN, controls: [Control.RIGHT, Control.UP] },
    ...[-3, 0, 3].map((y) => ({
      at: { x: -30, y },
      dir: { x: 1, y: 0 },
      power: 26,
      burn: 2,
      kind: ThrusterKind.MAIN,
      controls: [Control.BOOST],
    })),
  ],
  help: "←/→ tail or nose engine · ↑ both · Space rear engines",
};

export const SHIPS: Record<ShipId, ShipDesign> = { lander: LANDER, pods: PODS, shuttle: SHUTTLE };

export const SHIP_OPTIONS = Object.values(SHIPS).map((ship) => ({ value: ship.id, label: ship.name }));
