import type { BodyPoint } from "./lander";
import { ShipId } from "./ships";

export const Paint = { BODY: "body", ROOF: "roof", GLASS: "glass", STEEL: "steel", INK: "ink", FOIL: "foil" } as const;
export type Paint = (typeof Paint)[keyof typeof Paint];

export interface Part {
  shape: BodyPoint[];
  paint: Paint;
  trim?: { shape: BodyPoint[]; paint: Paint }[];
  shade?: BodyPoint[];
  sheen?: BodyPoint[];
  seams?: [BodyPoint, BodyPoint][];
}

/** A telescoping leg: a sleeve from the hip, a piston sliding out of it to the foot, a brace from the body to the sleeve. */
export interface Leg {
  hip: BodyPoint;
  brace: BodyPoint;
  foot: BodyPoint;
}

export interface Bell {
  at: BodyPoint;
  width: number;
  /** Which engine of a split pair, for the flame's share: −1 left, 1 right, 0 a single engine. */
  side: number;
}

export interface Nozzle {
  shape: BodyPoint[];
  collar: BodyPoint[];
  bell: Bell;
}

export interface Quad {
  at: BodyPoint;
  size: number;
}

/** How a ship is drawn, in ship-frame points: flames, legs and bells behind, parts front to back, quads on top. */
export interface ShipArt {
  parts: Part[];
  legs: Leg[];
  leg_width: number;
  /** The foot: a boot `pad` wide each side of the foot point, `pad_height` tall. */
  pad: number;
  pad_height: number;
  bells: Nozzle[];
  rcs: Quad[];
  crew: BodyPoint[];
  sling: number;
}

function box(x0: number, x1: number, z0: number, z1: number): BodyPoint[] {
  return [
    { x: x0, z: z0 },
    { x: x1, z: z0 },
    { x: x1, z: z1 },
    { x: x0, z: z1 },
  ];
}

function rounded(points: readonly BodyPoint[], rounds = 2): BodyPoint[] {
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

function circle(x: number, z: number, r: number, n = 20): BodyPoint[] {
  return Array.from({ length: n }, (_, i) => ({ x: x + r * Math.cos((i / n) * Math.PI * 2), z: z + r * Math.sin((i / n) * Math.PI * 2) }));
}

function ellipse_shape(x: number, z: number, rx: number, rz: number, from = 0, to = Math.PI * 2, n = 20): BodyPoint[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = from + ((to - from) * i) / n;
    return { x: x + rx * Math.cos(a), z: z + rz * Math.sin(a) };
  });
}

const mirror = (points: readonly BodyPoint[]) => points.map((p) => ({ x: -p.x, z: p.z })).reverse();

const below = (z: number) => box(-50, 50, -50, z);

function nozzle(x: number, top: number, bottom: number, throat: number, mouth: number, side = 0): Nozzle {
  const n = 8;
  const right: BodyPoint[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    right.push({ x: x + throat + (mouth - throat) * t * t, z: top + (bottom - top) * t });
  }
  const left = right.map((p) => ({ x: 2 * x - p.x, z: p.z })).reverse();
  const collar_h = Math.min(0.22, (top - bottom) * 0.3);
  return {
    shape: [...right, ...left],
    collar: rounded(box(x - throat * 1.25, x + throat * 1.25, top - collar_h, top + 0.05), 1),
    bell: { at: { x, z: bottom }, width: mouth * 2, side },
  };
}

const P = (x: number, z: number): BodyPoint => ({ x, z });
const legs = (hip: BodyPoint, brace: BodyPoint, foot: BodyPoint) => [
  { hip: P(-hip.x, hip.z), brace: P(-brace.x, brace.z), foot: P(-foot.x, foot.z) },
  { hip, brace, foot },
];
const zig = (x0: number, x1: number, z0: number, z1: number, n: number): [BodyPoint, BodyPoint][] =>
  Array.from({ length: n }, (_, i) => {
    const a = x0 + ((x1 - x0) * i) / n;
    const b = x0 + ((x1 - x0) * (i + 1)) / n;
    return i % 2 ? [P(a, z1), P(b, z0)] : [P(a, z0), P(b, z1)];
  });

const LANDER: ShipArt = {
  parts: [
    {
      shape: rounded(box(-2.2, 2.2, -1.3, 0.35), 2),
      paint: Paint.FOIL,
      trim: [{ shape: box(-3, 3, -0.45, -0.2), paint: Paint.ROOF }],
      shade: below(-0.7),
      sheen: box(-3, 3, 0.0, 0.35),
    },
    {
      shape: ellipse_shape(0, 0.3, 1.95, 2.1, 0, Math.PI, 24),
      paint: Paint.BODY,
      shade: below(0.8),
      sheen: ellipse_shape(-0.7, 1.75, 0.75, 0.42),
    },
    { shape: circle(0.55, 1.2, 0.64), paint: Paint.ROOF },
    { shape: circle(0.55, 1.2, 0.46), paint: Paint.GLASS },
    { shape: rounded(box(-0.28, 0.28, 2.3, 2.62), 1), paint: Paint.ROOF },
  ],
  legs: legs(P(1.9, -0.2), P(1.4, -1.25), P(3.1, -2.6)),
  leg_width: 0.42,
  pad: 0.75,
  pad_height: 0.4,
  bells: [nozzle(0, -1.3, -2.0, 0.42, 0.82)],
  rcs: [
    { at: P(-1.95, 1.05), size: 0.46 },
    { at: P(1.95, 1.05), size: 0.46 },
  ],
  crew: [P(0.55, 1.15)],
  sling: -2.1,
};

const POD = rounded(box(-4.1, -2.3, -1.2, 1.05), 2);
const PODS: ShipArt = {
  parts: [
    { shape: box(-2.5, 2.5, 0.05, 0.6), paint: Paint.STEEL, seams: zig(-2.5, 2.5, 0.05, 0.6, 8) },
    { shape: POD, paint: Paint.BODY, trim: [{ shape: box(-5, -2, 0.42, 0.68), paint: Paint.ROOF }], shade: below(-0.5), sheen: box(-3.85, -3.55, -0.85, 0.3) },
    { shape: mirror(POD), paint: Paint.BODY, trim: [{ shape: box(2, 5, 0.42, 0.68), paint: Paint.ROOF }], shade: below(-0.5), sheen: box(2.6, 2.9, -0.85, 0.3) },
    {
      shape: rounded([P(-1.15, -0.35), P(1.15, -0.35), P(1.2, 0.8), P(0.95, 0.8), P(-0.95, 0.8), P(-1.2, 0.8)], 1),
      paint: Paint.ROOF,
      shade: below(0.1),
    },
    { shape: ellipse_shape(0, 0.75, 0.95, 0.95, 0, Math.PI, 20), paint: Paint.GLASS, sheen: ellipse_shape(-0.4, 1.35, 0.3, 0.18) },
  ],
  legs: legs(P(4.0, -0.75), P(4.15, 0.1), P(3.7, -2.3)),
  leg_width: 0.26,
  pad: 0.45,
  pad_height: 0.24,
  bells: [nozzle(-3.2, -1.2, -1.85, 0.32, 0.6, -1), nozzle(3.2, -1.2, -1.85, 0.32, 0.6, 1)],
  rcs: [],
  crew: [P(0, 1.05)],
  sling: -2.0,
};

const SHUTTLE: ShipArt = {
  parts: [
    { shape: box(-5.2, 3.8, -1.6, -0.9), paint: Paint.STEEL, seams: zig(-5.2, 3.8, -1.6, -0.9, 8) },
    { shape: box(-5.2, 3.8, 1.15, 1.85), paint: Paint.STEEL, seams: zig(-5.2, 3.8, 1.15, 1.85, 8) },
    {
      shape: rounded(box(-4.6, 3.1, -0.85, 1.1), 1),
      paint: Paint.FOIL,
      shade: below(-0.3),
      seams: [-2.7, -0.75, 1.2].map((x) => [P(x, -0.85), P(x, 1.1)] as [BodyPoint, BodyPoint]),
    },
    {
      shape: rounded(box(-7.0, -4.7, -1.6, 1.9), 1),
      paint: Paint.BODY,
      trim: [{ shape: box(-8, -4, 1.3, 1.6), paint: Paint.ROOF }],
      shade: below(-0.6),
      sheen: box(-6.75, -6.45, -1.2, 1.2),
    },
    {
      shape: rounded([P(3.4, -1.6), P(6.3, -1.6), P(7.0, -0.5), P(6.9, 0.6), P(5.9, 1.85), P(3.4, 1.9)], 1),
      paint: Paint.BODY,
      trim: [{ shape: box(3, 8, -2, -1.05), paint: Paint.ROOF }],
      shade: below(-0.6),
      sheen: box(3.65, 3.95, -0.8, 1.6),
    },
    { shape: [P(5.4, 0.55), P(6.65, 0.55), P(5.85, 1.5), P(5.4, 1.5)], paint: Paint.GLASS },
  ],
  legs: legs(P(4.6, -1.3), P(3.6, -1.5), P(5.4, -3.1)),
  leg_width: 0.46,
  pad: 0.85,
  pad_height: 0.4,
  bells: [nozzle(-2.4, -1.6, -2.4, 0.44, 0.82), nozzle(2.4, -1.6, -2.4, 0.44, 0.82)],
  rcs: [
    { at: P(-6.95, 0.9), size: 0.5 },
    { at: P(6.95, -0.3), size: 0.5 },
  ],
  crew: [P(5.9, 0.95)],
  sling: -2.6,
};

export const ART: Record<ShipId, ShipArt> = { [ShipId.LANDER]: LANDER, [ShipId.PODS]: PODS, [ShipId.SHUTTLE]: SHUTTLE };
