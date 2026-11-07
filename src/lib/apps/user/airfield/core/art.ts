import type { BodyPoint } from "./plane";
import { PlaneId } from "./planes";

/** A body point with the share of the part's half width it sits at, for parts that narrow (the fuselage toward its tail). */
export interface Station extends BodyPoint {
  w?: number;
}

export interface Leg {
  from: BodyPoint;
  side: number;
}

/** A hinged surface: drawn from `upper` to the tip and back to `lower`, the tip `chord` behind the hinge at the surface's angle. */
export interface Hinged {
  hinge: BodyPoint;
  upper: BodyPoint;
  lower: BodyPoint;
  chord: number;
  /** Lateral range, metres from the centreline. */
  span: readonly [number, number];
  /** Full travel, radians: flaps down, an elevator either way. */
  travel: number;
}

/** How a plane is drawn, in body points: parts swept across their lateral range, as `draw.ts` sweeps them. */
export interface PlaneArt {
  fuselage: Station[];
  /** The body's half width. */
  width: number;
  fin: BodyPoint[];
  windows: BodyPoint[][];
  window_side: number;
  /** Window posts, in the body paint. */
  posts: [BodyPoint, BodyPoint][];
  /** Roof-paint areas clipped to the body: cowling, cheat line, the fin's band. */
  trim: Station[][];
  belly: Station[];
  spinner: BodyPoint[] | null;
  prop_hub: BodyPoint | null;
  wing: BodyPoint[];
  wing_root: number;
  struts: { foot: BodyPoint; foot_side: number; tops: BodyPoint[]; top_side: number } | null;
  flap: Hinged | null;
  /** Spoilers or airbrakes: plates on the wing's top that stand up as they open. */
  spoiler: { at: BodyPoint; chord: number; span: readonly [number, number] } | null;
  tailplane: BodyPoint[];
  tail_root: number;
  tail_span: number;
  elevator: Hinged;
  /** Main wheels `track` either side; a track of 0 is one wheel on the centreline. */
  main: { axle: BodyPoint; tyre: number; hub: number; track: number; half: number; legs: Leg[] };
  aux: { axle: BodyPoint; tyre: number; leg: BodyPoint };
  pods: { outline: BodyPoint[]; side: number; half: number; pylon: [BodyPoint, BodyPoint] } | null;
}

export function rounded(points: readonly Station[], rounds = 2): Station[] {
  let at: Station[] = [...points];
  for (let r = 0; r < rounds; r++) {
    const next: Station[] = [];
    at.forEach((p, i) => {
      const q = at[(i + 1) % at.length];
      const mix = (t: number): Station => ({ x: p.x + (q.x - p.x) * t, z: p.z + (q.z - p.z) * t, w: (p.w ?? 1) + ((q.w ?? 1) - (p.w ?? 1)) * t });
      next.push(mix(0.25), mix(0.75));
    });
    at = next;
  }
  return at;
}

function box(x0: number, x1: number, z0: number, z1: number): Station[] {
  return [
    { x: x0, z: z0 },
    { x: x1, z: z0 },
    { x: x1, z: z1 },
    { x: x0, z: z1 },
  ];
}

const DEG = Math.PI / 180;

const TRAINER: PlaneArt = {
  fuselage: rounded([
    { x: 2.0, z: 0.5, w: 0.36 },
    { x: 1.55, z: 0.68, w: 0.4 },
    { x: 1.12, z: 0.74, w: 0.42 },
    { x: 0.55, z: 1.34, w: 0.4 },
    { x: -0.7, z: 1.34, w: 0.38 },
    { x: -1.5, z: 0.98, w: 0.32 },
    { x: -4.4, z: 0.52, w: 0.1 },
    { x: -4.85, z: 0.46, w: 0.06 },
    { x: -4.88, z: 0.12, w: 0.06 },
    { x: -3.5, z: -0.04, w: 0.14 },
    { x: -1.0, z: -0.32, w: 0.34 },
    { x: 0.6, z: -0.44, w: 0.4 },
    { x: 1.65, z: -0.34, w: 0.38 },
    { x: 2.02, z: -0.14, w: 0.34 },
  ]),
  width: 1,
  fin: rounded(
    [
      { x: -3.6, z: 0.66 },
      { x: -4.3, z: 1.32 },
      { x: -4.55, z: 1.58 },
      { x: -4.82, z: 1.58 },
      { x: -4.98, z: 1.3 },
      { x: -4.9, z: 0.4 },
    ],
    1
  ),
  windows: [
    [
      { x: 1.08, z: 0.8 },
      { x: 0.55, z: 1.13 },
      { x: -0.55, z: 1.13 },
      { x: -0.55, z: 0.6 },
      { x: 0.9, z: 0.6 },
    ],
  ],
  window_side: 0.41,
  posts: [[{ x: 0.02, z: 1.13 }, { x: 0.02, z: 0.6 }]],
  trim: [
    [
      { x: 1.3, z: 0.4 },
      { x: -1.5, z: 0.4 },
      { x: -4.9, z: 0.34 },
      { x: -4.9, z: 0.24 },
      { x: -1.5, z: 0.26 },
      { x: 1.3, z: 0.26 },
    ],
    box(1.3, 2.4, -1, 1),
  ],
  belly: [
    { x: 2.4, z: -0.12 },
    { x: -5, z: 0.06 },
    { x: -5, z: -1 },
    { x: 2.4, z: -1 },
  ],
  spinner: rounded(
    [
      { x: 1.98, z: 0.42 },
      { x: 2.36, z: 0.15 },
      { x: 1.98, z: -0.12 },
    ],
    1
  ),
  prop_hub: { x: 2.12, z: 0.15 },
  wing: rounded(
    [
      { x: 0.82, z: 1.3 },
      { x: 0.55, z: 1.46 },
      { x: 0.05, z: 1.5 },
      { x: -0.44, z: 1.42 },
      { x: -0.44, z: 1.27 },
      { x: 0.55, z: 1.24 },
    ],
    1
  ),
  wing_root: 0.3,
  struts: { foot: { x: 0.2, z: -0.2 }, foot_side: 0.38, tops: [{ x: 0.5, z: 1.25 }, { x: -0.15, z: 1.25 }], top_side: 2.9 },
  flap: { hinge: { x: -0.44, z: 1.345 }, upper: { x: -0.44, z: 1.41 }, lower: { x: -0.44, z: 1.28 }, chord: 0.42, span: [0.45, 2.9], travel: 40 * DEG },
  spoiler: null,
  tailplane: [
    { x: -3.7, z: 0.48 },
    { x: -3.9, z: 0.55 },
    { x: -4.42, z: 0.54 },
    { x: -4.42, z: 0.42 },
    { x: -3.9, z: 0.41 },
  ],
  tail_root: 0,
  tail_span: 1.6,
  elevator: { hinge: { x: -4.42, z: 0.48 }, upper: { x: -4.42, z: 0.53 }, lower: { x: -4.42, z: 0.43 }, chord: 0.48, span: [0.05, 1.6], travel: 0.45 },
  main: {
    axle: { x: 0.35, z: -0.7 },
    tyre: 0.3,
    hub: 0.12,
    track: 0.9,
    half: 0.12,
    legs: [
      { from: { x: 0.8, z: -0.38 }, side: 0.3 },
      { from: { x: -0.1, z: -0.34 }, side: 0.3 },
    ],
  },
  aux: { axle: { x: -4.6, z: -0.1 }, tyre: 0.1, leg: { x: -4.25, z: 0.08 } },
  pods: null,
};

function stretch<T extends BodyPoint>(points: readonly T[], kx: number, kz: number): T[] {
  return points.map((p) => ({ ...p, x: p.x * kx, z: p.z * kz }));
}

const KX = 7.2 / 6.8;
const KZ = 1.05;

const STOL: PlaneArt = {
  ...TRAINER,
  fuselage: stretch(TRAINER.fuselage, KX, KZ),
  width: 1.08,
  fin: stretch(
    rounded(
      [
        { x: -3.4, z: 0.66 },
        { x: -4.2, z: 1.5 },
        { x: -4.5, z: 1.78 },
        { x: -4.85, z: 1.78 },
        { x: -5.0, z: 1.45 },
        { x: -4.9, z: 0.4 },
      ],
      1
    ),
    KX,
    1
  ),
  windows: [
    stretch(
      [
        { x: 1.08, z: 0.8 },
        { x: 0.55, z: 1.15 },
        { x: -0.9, z: 1.15 },
        { x: -0.9, z: 0.58 },
        { x: 0.9, z: 0.58 },
      ],
      KX,
      KZ
    ),
  ],
  window_side: 0.44,
  posts: [[{ x: 0.02 * KX, z: 1.18 }, { x: 0.02 * KX, z: 0.62 }], [{ x: -0.5 * KX, z: 1.18 }, { x: -0.5 * KX, z: 0.62 }]],
  trim: [stretch(TRAINER.trim[0], KX, KZ), box(1.35, 2.6, -1, 1)],
  belly: stretch(TRAINER.belly, KX, KZ),
  spinner: stretch(TRAINER.spinner!, KX, KZ),
  prop_hub: { x: 2.25, z: 0.16 },
  wing: rounded(
    [
      { x: 0.98, z: 1.38 },
      { x: 0.7, z: 1.56 },
      { x: 0.05, z: 1.6 },
      { x: -0.62, z: 1.52 },
      { x: -0.62, z: 1.36 },
      { x: 0.7, z: 1.33 },
    ],
    1
  ),
  wing_root: 0.32,
  struts: { foot: { x: 0.25, z: -0.22 }, foot_side: 0.4, tops: [{ x: 0.62, z: 1.34 }, { x: -0.2, z: 1.34 }], top_side: 3.1 },
  flap: { hinge: { x: -0.62, z: 1.44 }, upper: { x: -0.62, z: 1.51 }, lower: { x: -0.62, z: 1.37 }, chord: 0.62, span: [0.45, 3.9], travel: 50 * DEG },
  tailplane: stretch(TRAINER.tailplane, KX, KZ),
  tail_span: 1.8,
  elevator: { hinge: { x: -4.42 * KX, z: 0.5 }, upper: { x: -4.42 * KX, z: 0.556 }, lower: { x: -4.42 * KX, z: 0.45 }, chord: 0.5, span: [0.05, 1.8], travel: 0.45 },
  main: {
    axle: { x: 0.45, z: -0.78 },
    tyre: 0.42,
    hub: 0.15,
    track: 1.05,
    half: 0.17,
    legs: [
      { from: { x: 0.85, z: -0.4 }, side: 0.32 },
      { from: { x: -0.1, z: -0.36 }, side: 0.32 },
    ],
  },
  aux: { axle: { x: -5.0, z: -0.13 }, tyre: 0.12, leg: { x: -4.6, z: 0.08 } },
};

const AIRLINER: PlaneArt = {
  fuselage: rounded([
    { x: 18.8, z: -0.35, w: 0.25 },
    { x: 18.3, z: 0.75, w: 0.55 },
    { x: 16.4, z: 1.75, w: 0.85 },
    { x: 12.5, z: 2.02, w: 1 },
    { x: -9.5, z: 2.02, w: 1 },
    { x: -16.5, z: 1.45, w: 0.45 },
    { x: -18.8, z: 1.05, w: 0.12 },
    { x: -18.9, z: 0.6, w: 0.1 },
    { x: -11.5, z: -1.55, w: 0.75 },
    { x: -5.5, z: -2.02, w: 1 },
    { x: 12.5, z: -2.02, w: 1 },
    { x: 16.8, z: -1.55, w: 0.8 },
  ]),
  width: 1.98,
  fin: rounded(
    [
      { x: -10.8, z: 1.95 },
      { x: -15.8, z: 9.2 },
      { x: -17.7, z: 9.3 },
      { x: -18.9, z: 1.2 },
    ],
    1
  ),
  windows: Array.from({ length: 26 }, (_, i) => box(12.6 - i * 0.92, 12.25 - i * 0.92, 0.55, 0.98)),
  window_side: 1.99,
  posts: [],
  trim: [
    [
      { x: 18.9, z: 0.15 },
      { x: -18.9, z: 0.15 },
      { x: -18.9, z: -0.25 },
      { x: 18.9, z: -0.25 },
    ],
    rounded(
      [
        { x: -12.6, z: 4.5 },
        { x: -16.6, z: 9.3 },
        { x: -17.7, z: 9.3 },
        { x: -18.2, z: 5.6 },
      ],
      1
    ),
  ],
  belly: [
    { x: 19, z: -0.6 },
    { x: -19, z: -0.6 },
    { x: -19, z: -3 },
    { x: 19, z: -3 },
  ],
  spinner: null,
  prop_hub: null,
  wing: rounded(
    [
      { x: 4.2, z: -1.05 },
      { x: 3.2, z: -0.72 },
      { x: -0.8, z: -0.78 },
      { x: -3.6, z: -1.08 },
      { x: -3.6, z: -1.3 },
      { x: 3.2, z: -1.42 },
    ],
    1
  ),
  wing_root: 1.9,
  struts: null,
  flap: { hinge: { x: -3.5, z: -1.19 }, upper: { x: -3.5, z: -1.08 }, lower: { x: -3.5, z: -1.3 }, chord: 1.4, span: [2.2, 12.5], travel: 40 * DEG },
  spoiler: { at: { x: -1.4, z: -0.84 }, chord: 1.5, span: [3, 11] },
  tailplane: [
    { x: -14.6, z: 1.42 },
    { x: -15.6, z: 1.72 },
    { x: -17.9, z: 1.66 },
    { x: -17.9, z: 1.3 },
    { x: -15.6, z: 1.26 },
  ],
  tail_root: 0.6,
  tail_span: 6.2,
  elevator: { hinge: { x: -17.9, z: 1.48 }, upper: { x: -17.9, z: 1.64 }, lower: { x: -17.9, z: 1.32 }, chord: 1.1, span: [0.6, 6.2], travel: 0.45 },
  main: {
    axle: { x: -0.8, z: -3.0 },
    tyre: 0.6,
    hub: 0.25,
    track: 3.8,
    half: 0.45,
    legs: [
      { from: { x: -0.4, z: -1.3 }, side: 3.6 },
      { from: { x: -1.7, z: -1.4 }, side: 3.4 },
    ],
  },
  aux: { axle: { x: 11.5, z: -3.12 }, tyre: 0.38, leg: { x: 11.8, z: -1.8 } },
  pods: {
    outline: rounded(
      [
        { x: 7.6, z: -1.45 },
        { x: 3.6, z: -1.55 },
        { x: 2.7, z: -2.25 },
        { x: 3.6, z: -2.95 },
        { x: 7.6, z: -3.05 },
        { x: 7.9, z: -2.25 },
      ],
      1
    ),
    side: 5.75,
    half: 0.85,
    pylon: [
      { x: 5.6, z: -1.5 },
      { x: 3.0, z: -1.05 },
    ],
  },
};

const GLIDER: PlaneArt = {
  fuselage: rounded([
    { x: 1.78, z: 0.0, w: 0.35 },
    { x: 1.5, z: 0.3, w: 0.8 },
    { x: 0.9, z: 0.46, w: 1 },
    { x: 0.1, z: 0.48, w: 1 },
    { x: -0.7, z: 0.34, w: 0.75 },
    { x: -2.2, z: 0.17, w: 0.35 },
    { x: -4.8, z: 0.12, w: 0.2 },
    { x: -5.15, z: 0.14, w: 0.18 },
    { x: -5.15, z: -0.06, w: 0.18 },
    { x: -4.6, z: -0.09, w: 0.2 },
    { x: -2.2, z: -0.13, w: 0.35 },
    { x: -0.4, z: -0.42, w: 0.8 },
    { x: 0.8, z: -0.48, w: 1 },
    { x: 1.5, z: -0.32, w: 0.8 },
  ]),
  width: 0.33,
  fin: rounded(
    [
      { x: -4.05, z: 0.13 },
      { x: -4.85, z: 1.22 },
      { x: -5.2, z: 1.24 },
      { x: -5.17, z: 0.05 },
    ],
    1
  ),
  windows: [
    rounded(
      [
        { x: 1.48, z: 0.28 },
        { x: 0.95, z: 0.7 },
        { x: 0.05, z: 0.66 },
        { x: -0.35, z: 0.42 },
        { x: 0.9, z: 0.44 },
      ],
      1
    ),
  ],
  window_side: 0.3,
  posts: [],
  trim: [
    [
      { x: 1.8, z: 0.0 },
      { x: -5.2, z: 0.03 },
      { x: -5.2, z: -0.03 },
      { x: 1.8, z: -0.07 },
    ],
  ],
  belly: [
    { x: 1.9, z: -0.2 },
    { x: -5.2, z: -0.03 },
    { x: -5.2, z: -1 },
    { x: 1.9, z: -1 },
  ],
  spinner: null,
  prop_hub: null,
  wing: rounded(
    [
      { x: 0.42, z: 0.38 },
      { x: 0.25, z: 0.48 },
      { x: -0.1, z: 0.5 },
      { x: -0.36, z: 0.44 },
      { x: -0.36, z: 0.37 },
      { x: 0.25, z: 0.33 },
    ],
    1
  ),
  wing_root: 0.3,
  struts: null,
  flap: null,
  spoiler: { at: { x: -0.08, z: 0.49 }, chord: 0.16, span: [1.5, 3.2] },
  tailplane: [
    { x: -4.78, z: 1.24 },
    { x: -4.92, z: 1.31 },
    { x: -5.32, z: 1.3 },
    { x: -5.32, z: 1.2 },
    { x: -4.92, z: 1.18 },
  ],
  tail_root: 0,
  tail_span: 1.55,
  elevator: { hinge: { x: -5.32, z: 1.25 }, upper: { x: -5.32, z: 1.29 }, lower: { x: -5.32, z: 1.21 }, chord: 0.28, span: [0.05, 1.55], travel: 0.45 },
  main: { axle: { x: 0.15, z: -0.5 }, tyre: 0.25, hub: 0.09, track: 0, half: 0.07, legs: [] },
  aux: { axle: { x: -5.0, z: -0.15 }, tyre: 0.1, leg: { x: -4.9, z: -0.05 } },
  pods: null,
};

export const ART: Record<PlaneId, PlaneArt> = {
  [PlaneId.TRAINER]: TRAINER,
  [PlaneId.STOL]: STOL,
  [PlaneId.AIRLINER]: AIRLINER,
  [PlaneId.GLIDER]: GLIDER,
};
