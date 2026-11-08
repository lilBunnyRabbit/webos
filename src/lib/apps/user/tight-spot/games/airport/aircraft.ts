import { centroid, type Polygon, type Pose, type Vec } from "$kit/games/play2d/geometry";
import { PUSHBACK, to_world, type TrailerSpec } from "../../core/vehicle";

export const AircraftPart = {
  FUSELAGE: "fuselage",
  WING: "wing",
  ENGINE: "engine",
  TAILPLANE: "tailplane",
  GEAR: "gear",
} as const;
export type AircraftPart = (typeof AircraftPart)[keyof typeof AircraftPart];

/** Ground vehicles drive under what's high; an aircraft's high parts meet only other high things. */
export const Height = { LOW: "low", HIGH: "high" } as const;
export type Height = (typeof Height)[keyof typeof Height];

export const Fleet = { NARROW: "narrow", WIDE: "wide" } as const;
export type Fleet = (typeof Fleet)[keyof typeof Fleet];

export interface Shape {
  part: AircraftPart;
  local: Vec[];
}

export interface Marks {
  fin: number;
  intake: { x: number; y: number; length: number; width: number };
  gear: { y: number; length: number; width: number };
  tip: { x: number; length: number };
  windows: number;
}

export interface Airframe {
  fleet: Fleet;
  name: string;
  /** The link as the pushback tug holds it; towing moves only its hinge. */
  link: TrailerSpec;
  nose_gear: number;
  nose: number;
  tail: number;
  span: number;
  half: number;
  shapes: readonly Shape[];
  height: Record<AircraftPart, Height>;
  marks: Marks;
}

const mirror = (shape: Vec[]): Vec[] => shape.map((p) => ({ x: p.x, y: -p.y })).reverse();
const box = (x0: number, y0: number, x1: number, y1: number): Vec[] => [
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
  { x: x0, y: y0 },
];

function shapes(parts: { gear: Vec[]; engine: Vec[]; wing: Vec[]; tailplane: Vec[]; fuselage: Vec[] }): Shape[] {
  return [
    { part: AircraftPart.GEAR, local: parts.gear },
    { part: AircraftPart.GEAR, local: mirror(parts.gear) },
    { part: AircraftPart.ENGINE, local: parts.engine },
    { part: AircraftPart.ENGINE, local: mirror(parts.engine) },
    { part: AircraftPart.WING, local: parts.wing },
    { part: AircraftPart.WING, local: mirror(parts.wing) },
    { part: AircraftPart.TAILPLANE, local: parts.tailplane },
    { part: AircraftPart.TAILPLANE, local: mirror(parts.tailplane) },
    { part: AircraftPart.FUSELAGE, local: parts.fuselage },
  ];
}

function fuselage(nose: number, half: number, tail: number, at: { cheek: number; chin: number; waist: number; neck: number; neck_half: number; tail_half: number }): Vec[] {
  return [
    { x: nose, y: 0 },
    { x: nose - at.chin, y: at.cheek },
    { x: nose - at.waist, y: half },
    { x: at.neck, y: half },
    { x: at.neck - 5, y: at.neck_half },
    { x: tail, y: at.tail_half },
    { x: tail, y: -at.tail_half },
    { x: at.neck - 5, y: -at.neck_half },
    { x: at.neck, y: -half },
    { x: nose - at.waist, y: -half },
    { x: nose - at.chin, y: -at.cheek },
  ];
}

const A320 = PUSHBACK.hitches[0];
const A320_NOSE = A320.axle - A320.drawbar;
const A320_TAIL = A320_NOSE - A320.box_length;
const A320_HALF = A320.width / 2;
const A320_TIP = 35.8 / 2;

// The pose is the main gear, x to the nose, y to the left wing. Every part is convex, since collision is SAT.
export const NARROWBODY: Airframe = {
  fleet: Fleet.NARROW,
  name: "airliner",
  link: A320,
  nose_gear: A320.axle,
  nose: A320_NOSE,
  tail: A320_TAIL,
  span: 35.8,
  half: A320_HALF,
  shapes: shapes({
    gear: box(-0.6, 3.45, 0.6, 4.15),
    engine: box(2.2, 4.55, 7.4, 6.95),
    wing: [
      { x: 5.2, y: A320_HALF - 0.1 },
      { x: -2.6, y: A320_TIP },
      { x: -4.2, y: A320_TIP },
      { x: -3.4, y: A320_HALF - 0.1 },
    ],
    tailplane: [
      { x: -14.6, y: 0.6 },
      { x: -17.6, y: 6.2 },
      { x: -18.9, y: 6.2 },
      { x: -18.7, y: 0.6 },
    ],
    fuselage: fuselage(A320_NOSE, A320_HALF, A320_TAIL, { cheek: 1.3, chin: 1.1, waist: 2.9, neck: -12, neck_half: 1.2, tail_half: 0.4 }),
  }),
  height: {
    fuselage: Height.LOW,
    engine: Height.LOW,
    gear: Height.LOW,
    wing: Height.HIGH,
    tailplane: Height.HIGH,
  },
  marks: {
    fin: -12.5,
    intake: { x: 7.3, y: 5.75, length: 0.25, width: 0.95 },
    gear: { y: 3.8, length: 1.2, width: 0.7 },
    tip: { x: -4.2, length: 1.6 },
    windows: 1,
  },
};

// A350 class: 66.8 m long, 64.75 m span, 5.96 m wide, nose gear 28.6 m ahead of the main gear and 6.3 m behind the
// nose. The hinge is 11.5 m ahead of the heavy tug's rear axle, so its front stops just short of the nose, like the
// narrowbody's. Nose gear steering locks at 70°.
const WIDE_HALF = 2.98;
const WIDE_TIP = 64.75 / 2;
const WIDE_LINK: TrailerSpec = {
  hitch: -11.5,
  axle: 28.6,
  drawbar: -6.3,
  box_length: 66.8,
  width: WIDE_HALF * 2,
  track: 10.6,
  wheel_diameter: 1.4,
  wheel_width: 0.6,
  max_angle: (70 * Math.PI) / 180,
  rest: Math.PI,
};
const WIDE_NOSE = WIDE_LINK.axle - WIDE_LINK.drawbar;
const WIDE_TAIL = WIDE_NOSE - WIDE_LINK.box_length;

export const WIDEBODY: Airframe = {
  fleet: Fleet.WIDE,
  name: "widebody",
  link: WIDE_LINK,
  nose_gear: WIDE_LINK.axle,
  nose: WIDE_NOSE,
  tail: WIDE_TAIL,
  span: 64.75,
  half: WIDE_HALF,
  shapes: shapes({
    gear: box(-1.2, 4.5, 1.2, 6.1),
    engine: box(1.4, 8.9, 8.8, 11.9),
    wing: [
      { x: 9, y: WIDE_HALF - 0.1 },
      { x: -9.3, y: WIDE_TIP },
      { x: -11, y: WIDE_TIP },
      { x: -5.5, y: WIDE_HALF - 0.1 },
    ],
    tailplane: [
      { x: -24.2, y: 0.9 },
      { x: -29.4, y: 9.7 },
      { x: -31.1, y: 9.7 },
      { x: -30.8, y: 0.9 },
    ],
    fuselage: fuselage(WIDE_NOSE, WIDE_HALF, WIDE_TAIL, { cheek: 2, chin: 1.6, waist: 4.2, neck: -21, neck_half: 1.7, tail_half: 0.5 }),
  }),
  height: {
    fuselage: Height.LOW,
    engine: Height.LOW,
    gear: Height.LOW,
    wing: Height.HIGH,
    tailplane: Height.HIGH,
  },
  marks: {
    fin: -21.5,
    intake: { x: 8.7, y: 10.4, length: 0.35, width: 1.3 },
    gear: { y: 5.3, length: 2.4, width: 1.6 },
    tip: { x: -11, length: 1.7 },
    windows: WIDE_HALF / A320_HALF,
  },
};

export const AIRFRAMES: Record<Fleet, Airframe> = { narrow: NARROWBODY, wide: WIDEBODY };

export const NOSE_GEAR = NARROWBODY.nose_gear;
export const NOSE = NARROWBODY.nose;
export const TAIL = NARROWBODY.tail;
export const SPAN = NARROWBODY.span;

export function grow(shape: readonly Vec[], margin: number): Vec[] {
  if (margin <= 0) return [...shape];
  const middle = centroid(shape);
  const lines = shape.map((p, i) => {
    const q = shape[(i + 1) % shape.length];
    const length = Math.hypot(q.x - p.x, q.y - p.y);
    let nx = (q.y - p.y) / length;
    let ny = -(q.x - p.x) / length;
    if (nx * (p.x - middle.x) + ny * (p.y - middle.y) < 0) {
      nx = -nx;
      ny = -ny;
    }
    return { p: { x: p.x + nx * margin, y: p.y + ny * margin }, d: { x: q.x - p.x, y: q.y - p.y } };
  });
  return lines.map((line, i) => {
    const before = lines[(i + lines.length - 1) % lines.length];
    const denom = before.d.x * line.d.y - before.d.y * line.d.x;
    if (Math.abs(denom) < 1e-9) return line.p;
    const t = ((line.p.x - before.p.x) * line.d.y - (line.p.y - before.p.y) * line.d.x) / denom;
    return { x: before.p.x + before.d.x * t, y: before.p.y + before.d.y * t };
  });
}

const grown = new Map<Airframe, Map<number, Vec[][]>>();

function locals(airframe: Airframe, margin: number): Vec[][] {
  let by_margin = grown.get(airframe);
  if (!by_margin) grown.set(airframe, (by_margin = new Map()));
  let found = by_margin.get(margin);
  if (!found) by_margin.set(margin, (found = airframe.shapes.map((shape) => grow(shape.local, margin))));
  return found;
}

export function aircraft_parts(pose: Pose, margin = 0, airframe: Airframe = NARROWBODY): Polygon[] {
  return locals(airframe, margin).map((local) => local.map((point) => to_world(pose, point)));
}

export function is_high(index: number, airframe: Airframe = NARROWBODY): boolean {
  return airframe.height[airframe.shapes[index].part] === Height.HIGH;
}

export function nose_gear(pose: Pose, airframe: Airframe = NARROWBODY): Vec {
  return to_world(pose, { x: airframe.nose_gear, y: 0 });
}

export function pose_from_nose_gear(at: Vec, heading: number, airframe: Airframe = NARROWBODY): Pose {
  const length = airframe.nose_gear;
  return { x: at.x - Math.cos(heading) * length, y: at.y - Math.sin(heading) * length, heading };
}
