import type { BodyPoint } from "./lander";
import { ShipId } from "./ships";

export const Paint = { BODY: "body", ROOF: "roof", GLASS: "glass", STEEL: "steel", INK: "ink", FOIL: "foil" } as const;
export type Paint = (typeof Paint)[keyof typeof Paint];

export interface Part {
  shape: BodyPoint[];
  paint: Paint;
}

export interface Leg {
  hip: BodyPoint;
  /** A second strut from the body to the leg's lower end. */
  brace: BodyPoint;
  foot: BodyPoint;
}

export interface Bell {
  /** The nozzle's exit, the flame's root. */
  at: BodyPoint;
  width: number;
  /** Which engine of a split pair, for the flame's share: −1 left, 1 right, 0 a single engine. */
  side: number;
}

/** How a ship is drawn, in ship-frame points: legs and bells behind, parts front to back, RCS quads on top. */
export interface ShipArt {
  parts: Part[];
  legs: Leg[];
  bells: { shape: BodyPoint[]; bell: Bell }[];
  rcs: BodyPoint[];
  pad: number;
}

function box(x0: number, x1: number, z0: number, z1: number): BodyPoint[] {
  return [
    { x: x0, z: z0 },
    { x: x1, z: z0 },
    { x: x1, z: z1 },
    { x: x0, z: z1 },
  ];
}

export function rounded(points: readonly BodyPoint[], rounds = 2): BodyPoint[] {
  let at: BodyPoint[] = [...points];
  for (let r = 0; r < rounds; r++) {
    const next: BodyPoint[] = [];
    at.forEach((p, i) => {
      const q = at[(i + 1) % at.length];
      next.push({ x: p.x + (q.x - p.x) * 0.25, z: p.z + (q.z - p.z) * 0.25 }, { x: p.x + (q.x - p.x) * 0.75, z: p.z + (q.z - p.z) * 0.75 });
    });
    at = next;
  }
  return at;
}

function bell(x: number, top: number, bottom: number, throat: number, mouth: number, side = 0) {
  return {
    shape: [
      { x: x - throat, z: top },
      { x: x + throat, z: top },
      { x: x + mouth, z: bottom },
      { x: x - mouth, z: bottom },
    ],
    bell: { at: { x, z: bottom }, width: mouth * 2, side },
  };
}

const mirror = (points: BodyPoint[]) => points.map((p) => ({ x: -p.x, z: p.z }));

const LANDER: ShipArt = {
  parts: [
    { shape: rounded(box(-2.25, 2.25, -1.3, 0.45), 1), paint: Paint.FOIL },
    { shape: box(-2.25, 2.25, -0.55, -0.35), paint: Paint.ROOF },
    {
      shape: rounded(
        [
          { x: -1.7, z: 0.4 },
          { x: 1.7, z: 0.4 },
          { x: 1.9, z: 1.35 },
          { x: 1.1, z: 2.35 },
          { x: -1.1, z: 2.35 },
          { x: -1.9, z: 1.35 },
        ],
        1
      ),
      paint: Paint.BODY,
    },
    {
      shape: [
        { x: 0.25, z: 1.25 },
        { x: 1.35, z: 1.25 },
        { x: 0.95, z: 1.95 },
        { x: 0.25, z: 1.95 },
      ],
      paint: Paint.GLASS,
    },
    { shape: box(-0.45, 0.45, 2.35, 2.6), paint: Paint.ROOF },
  ],
  legs: [
    { hip: { x: -1.9, z: 0.1 }, brace: { x: -1.6, z: -1.2 }, foot: { x: -3.1, z: -2.6 } },
    { hip: { x: 1.9, z: 0.1 }, brace: { x: 1.6, z: -1.2 }, foot: { x: 3.1, z: -2.6 } },
  ],
  bells: [bell(0, -1.3, -2.0, 0.35, 0.75)],
  rcs: [
    { x: -1.95, z: 1.75 },
    { x: 1.95, z: 1.75 },
  ],
  pad: 0.75,
};

const POD = rounded(box(-4.1, -2.3, -1.2, 1.05), 2);

const PODS: ShipArt = {
  parts: [
    { shape: box(-2.4, 2.4, 0.1, 0.5), paint: Paint.STEEL },
    { shape: POD, paint: Paint.BODY },
    { shape: mirror(POD), paint: Paint.BODY },
    { shape: rounded(box(-4.1, -2.3, 0.55, 0.8), 1), paint: Paint.ROOF },
    { shape: rounded(box(2.3, 4.1, 0.55, 0.8), 1), paint: Paint.ROOF },
    {
      shape: rounded(
        [
          { x: -1.1, z: -0.35 },
          { x: 1.1, z: -0.35 },
          { x: 1.15, z: 1.1 },
          { x: 0.6, z: 1.7 },
          { x: -0.6, z: 1.7 },
          { x: -1.15, z: 1.1 },
        ],
        1
      ),
      paint: Paint.ROOF,
    },
    { shape: rounded(box(-0.55, 0.55, 0.65, 1.35), 1), paint: Paint.GLASS },
  ],
  legs: [
    { hip: { x: -3.6, z: -0.9 }, brace: { x: -2.6, z: -1.0 }, foot: { x: -3.7, z: -2.3 } },
    { hip: { x: 3.6, z: -0.9 }, brace: { x: 2.6, z: -1.0 }, foot: { x: 3.7, z: -2.3 } },
  ],
  bells: [bell(-3.2, -1.2, -1.85, 0.3, 0.6, -1), bell(3.2, -1.2, -1.85, 0.3, 0.6, 1)],
  rcs: [],
  pad: 0.6,
};

const SHUTTLE: ShipArt = {
  parts: [
    {
      shape: rounded(
        [
          { x: -6.6, z: -1.6 },
          { x: 5.8, z: -1.6 },
          { x: 7.0, z: -0.6 },
          { x: 6.9, z: 0.5 },
          { x: 5.4, z: 1.8 },
          { x: -6.3, z: 1.9 },
          { x: -7.0, z: 0.6 },
        ],
        1
      ),
      paint: Paint.BODY,
    },
    { shape: box(-5.6, 3.6, 1.35, 1.85), paint: Paint.ROOF },
    { shape: box(-6.6, 6.2, -1.6, -1.05), paint: Paint.ROOF },
    {
      shape: [
        { x: 5.0, z: 0.5 },
        { x: 6.45, z: 0.5 },
        { x: 5.3, z: 1.55 },
        { x: 4.5, z: 1.55 },
      ],
      paint: Paint.GLASS,
    },
    { shape: box(-4.8, 3.2, -0.6, 0.9), paint: Paint.FOIL },
    { shape: box(-0.8, -0.65, -0.6, 0.9), paint: Paint.INK },
  ],
  legs: [
    { hip: { x: -4.6, z: -1.2 }, brace: { x: -3.6, z: -1.5 }, foot: { x: -5.4, z: -3.1 } },
    { hip: { x: 4.6, z: -1.2 }, brace: { x: 3.6, z: -1.5 }, foot: { x: 5.4, z: -3.1 } },
  ],
  bells: [bell(-2.4, -1.6, -2.35, 0.4, 0.8), bell(2.4, -1.6, -2.35, 0.4, 0.8)],
  rcs: [
    { x: -6.6, z: 1.2 },
    { x: 6.6, z: 1.0 },
  ],
  pad: 0.9,
};

export const ART: Record<ShipId, ShipArt> = { [ShipId.LANDER]: LANDER, [ShipId.PODS]: PODS, [ShipId.SHUTTLE]: SHUTTLE };
