export interface Vec {
  x: number;
  y: number;
}

export type Polygon = readonly Vec[];

export interface Bounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Metres; `heading` in radians, 0 is east and it grows clockwise on screen (y points down). */
export interface Pose {
  x: number;
  y: number;
  heading: number;
}

export function rect(x0: number, y0: number, x1: number, y1: number): Vec[] {
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
}

export function oriented_box(x: number, y: number, heading: number, length: number, width: number): Vec[] {
  const cos = Math.cos(heading);
  const sin = Math.sin(heading);
  const hl = length / 2;
  const hw = width / 2;
  return [
    { x: x + cos * hl - sin * hw, y: y + sin * hl + cos * hw },
    { x: x + cos * hl + sin * hw, y: y + sin * hl - cos * hw },
    { x: x - cos * hl + sin * hw, y: y - sin * hl - cos * hw },
    { x: x - cos * hl - sin * hw, y: y - sin * hl + cos * hw },
  ];
}

export function bounds_of(points: Polygon): Bounds {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of points) {
    if (p.x < x0) x0 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.x > x1) x1 = p.x;
    if (p.y > y1) y1 = p.y;
  }
  return { x0, y0, x1, y1 };
}

export function bounds_overlap(a: Bounds, b: Bounds, margin = 0): boolean {
  return a.x0 - margin <= b.x1 && b.x0 - margin <= a.x1 && a.y0 - margin <= b.y1 && b.y0 - margin <= a.y1;
}

export function centroid(points: Polygon): Vec {
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
  }
  return { x: x / points.length, y: y / points.length };
}

export function wrap_angle(a: number): number {
  return ((((a + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
}

export function angle_between(a: number, b: number): number {
  return Math.abs(wrap_angle(a - b));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
