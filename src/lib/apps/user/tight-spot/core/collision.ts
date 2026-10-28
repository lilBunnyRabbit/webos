import type { Polygon, Vec } from "./geometry";

function project(points: Polygon, ax: number, ay: number): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const p of points) {
    const d = p.x * ax + p.y * ay;
    if (d < min) min = d;
    if (d > max) max = d;
  }
  return [min, max];
}

function separated_on_edges(a: Polygon, b: Polygon): boolean {
  for (let i = 0; i < a.length; i++) {
    const p = a[i];
    const q = a[(i + 1) % a.length];
    const ax = q.y - p.y;
    const ay = p.x - q.x;
    const [a0, a1] = project(a, ax, ay);
    const [b0, b1] = project(b, ax, ay);
    if (a1 <= b0 || b1 <= a0) return true;
  }
  return false;
}

// Touching edges count as apart, so a car whose side lies exactly on a wall's face isn't a crash.
export function overlaps(a: Polygon, b: Polygon): boolean {
  return !separated_on_edges(a, b) && !separated_on_edges(b, a);
}

function orientation(polygon: Polygon): number {
  let area = 0;
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i];
    const q = polygon[(i + 1) % polygon.length];
    area += p.x * q.y - q.x * p.y;
  }
  return Math.sign(area);
}

/** `margin` > 0 asks for the point to sit at least that far inside every edge. */
export function inside_convex(point: Vec, polygon: Polygon, margin = 0): boolean {
  const turn = orientation(polygon);
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i];
    const q = polygon[(i + 1) % polygon.length];
    const ex = q.x - p.x;
    const ey = q.y - p.y;
    const distance = (turn * (ex * (point.y - p.y) - ey * (point.x - p.x))) / Math.hypot(ex, ey);
    if (distance < margin) return false;
  }
  return true;
}

function segment_hit(a: Vec, b: Vec, c: Vec, d: Vec): Vec | null {
  const rx = b.x - a.x;
  const ry = b.y - a.y;
  const sx = d.x - c.x;
  const sy = d.y - c.y;
  const denom = rx * sy - ry * sx;
  if (Math.abs(denom) < 1e-12) return null;
  const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / denom;
  const u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: a.x + rx * t, y: a.y + ry * t };
}

export function contact_point(a: Polygon, b: Polygon): Vec | null {
  const points: Vec[] = [];
  for (const p of a) if (inside_convex(p, b)) points.push(p);
  for (const p of b) if (inside_convex(p, a)) points.push(p);
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      const hit = segment_hit(a[i], a[(i + 1) % a.length], b[j], b[(j + 1) % b.length]);
      if (hit) points.push(hit);
    }
  }
  if (points.length === 0) return null;
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
  }
  return { x: x / points.length, y: y / points.length };
}

export function distance_to_segment(point: Vec, a: Vec, b: Vec): { distance: number; at: Vec } {
  const ex = b.x - a.x;
  const ey = b.y - a.y;
  const length = ex * ex + ey * ey;
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - a.x) * ex + (point.y - a.y) * ey) / length));
  const at = { x: a.x + ex * t, y: a.y + ey * t };
  return { distance: Math.hypot(point.x - at.x, point.y - at.y), at };
}
