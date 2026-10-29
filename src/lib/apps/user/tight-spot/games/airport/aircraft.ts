import { centroid, type Polygon, type Pose, type Vec } from "../../core/geometry";
import { PUSHBACK, to_world } from "../../core/vehicle";

export const AIRLINER = PUSHBACK.hitches[0];

export const NOSE_GEAR = AIRLINER.axle;
export const NOSE = AIRLINER.axle - AIRLINER.drawbar;
export const TAIL = NOSE - AIRLINER.box_length;
export const SPAN = 35.8;
const HALF = AIRLINER.width / 2;
const TIP = SPAN / 2;

const mirror = (shape: Vec[]): Vec[] => shape.map((p) => ({ x: p.x, y: -p.y })).reverse();

// The pose is the main gear, x to the nose, y to the left wing. Every part is convex, since collision is SAT.
const FUSELAGE: Vec[] = [
  { x: NOSE, y: 0 },
  { x: NOSE - 1.1, y: 1.3 },
  { x: NOSE - 2.9, y: HALF },
  { x: -12, y: HALF },
  { x: -17, y: 1.2 },
  { x: TAIL, y: 0.4 },
  { x: TAIL, y: -0.4 },
  { x: -17, y: -1.2 },
  { x: -12, y: -HALF },
  { x: NOSE - 2.9, y: -HALF },
  { x: NOSE - 1.1, y: -1.3 },
];
const WING: Vec[] = [
  { x: 5.2, y: HALF - 0.1 },
  { x: -2.6, y: TIP },
  { x: -4.2, y: TIP },
  { x: -3.4, y: HALF - 0.1 },
];
const ENGINE: Vec[] = [
  { x: 7.4, y: 4.55 },
  { x: 7.4, y: 6.95 },
  { x: 2.2, y: 6.95 },
  { x: 2.2, y: 4.55 },
];
const TAILPLANE: Vec[] = [
  { x: -14.6, y: 0.6 },
  { x: -17.6, y: 6.2 },
  { x: -18.9, y: 6.2 },
  { x: -18.7, y: 0.6 },
];

const GEAR: Vec[] = [
  { x: 0.6, y: 3.45 },
  { x: 0.6, y: 4.15 },
  { x: -0.6, y: 4.15 },
  { x: -0.6, y: 3.45 },
];

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

export const HEIGHT: Record<AircraftPart, Height> = {
  fuselage: Height.LOW,
  engine: Height.LOW,
  gear: Height.LOW,
  wing: Height.HIGH,
  tailplane: Height.HIGH,
};

export interface Shape {
  part: AircraftPart;
  local: Vec[];
}

export const SHAPES: readonly Shape[] = [
  { part: AircraftPart.GEAR, local: GEAR },
  { part: AircraftPart.GEAR, local: mirror(GEAR) },
  { part: AircraftPart.ENGINE, local: ENGINE },
  { part: AircraftPart.ENGINE, local: mirror(ENGINE) },
  { part: AircraftPart.WING, local: WING },
  { part: AircraftPart.WING, local: mirror(WING) },
  { part: AircraftPart.TAILPLANE, local: TAILPLANE },
  { part: AircraftPart.TAILPLANE, local: mirror(TAILPLANE) },
  { part: AircraftPart.FUSELAGE, local: FUSELAGE },
];

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

const grown = new Map<number, Vec[][]>();

function locals(margin: number): Vec[][] {
  let found = grown.get(margin);
  if (!found) grown.set(margin, (found = SHAPES.map((shape) => grow(shape.local, margin))));
  return found;
}

export function aircraft_parts(pose: Pose, margin = 0): Polygon[] {
  return locals(margin).map((local) => local.map((point) => to_world(pose, point)));
}

export function is_high(index: number): boolean {
  return HEIGHT[SHAPES[index].part] === Height.HIGH;
}

export function nose_gear(pose: Pose): Vec {
  return to_world(pose, { x: NOSE_GEAR, y: 0 });
}

export function pose_from_nose_gear(at: Vec, heading: number): Pose {
  return { x: at.x - Math.cos(heading) * NOSE_GEAR, y: at.y - Math.sin(heading) * NOSE_GEAR, heading };
}
