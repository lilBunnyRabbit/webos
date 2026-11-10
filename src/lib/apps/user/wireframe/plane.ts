import { face_sides, same_side, sub3, type Vec3, type WireFace, type WireLine, type WirePoint } from "./model";

// Coordinates are rounded to 0.01 mm, so a loop drawn flat is off its plane by far less than this.
export const FLAT = 0.05;

export function normal_of(points: readonly Vec3[]): Vec3 {
  const n = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    n.x += (a.y - b.y) * (a.z + b.z);
    n.y += (a.z - b.z) * (a.x + b.x);
    n.z += (a.x - b.x) * (a.y + b.y);
  }
  return n;
}

export interface Plane {
  normal: Vec3;
  origin: Vec3;
}

export function plane_of(points: readonly Vec3[]): Plane | null {
  const n = normal_of(points);
  const length = Math.hypot(n.x, n.y, n.z);
  if (length < 1e-9) return null;
  return { normal: { x: n.x / length, y: n.y / length, z: n.z / length }, origin: points[0] };
}

const distance = (plane: Plane, p: Vec3) => {
  const d = sub3(p, plane.origin);
  return d.x * plane.normal.x + d.y * plane.normal.y + d.z * plane.normal.z;
};

export function is_flat(points: readonly Vec3[]): boolean {
  const plane = plane_of(points);
  return !!plane && points.every((point) => Math.abs(distance(plane, point)) <= FLAT);
}

export function on_face(corners: readonly Vec3[], plane: Plane, p: Vec3): boolean {
  if (Math.abs(distance(plane, p)) > FLAT) return false;
  const n = plane.normal;
  const [u, v] =
    Math.abs(n.x) >= Math.abs(n.y) && Math.abs(n.x) >= Math.abs(n.z)
      ? (["y", "z"] as const)
      : Math.abs(n.y) >= Math.abs(n.z)
        ? (["x", "z"] as const)
        : (["x", "y"] as const);
  let inside = false;
  for (let i = 0, j = corners.length - 1; i < corners.length; j = i++) {
    const a = corners[i];
    const b = corners[j];
    const ab = { u: b[u] - a[u], v: b[v] - a[v] };
    const ap = { u: p[u] - a[u], v: p[v] - a[v] };
    const span = Math.hypot(ab.u, ab.v);
    const t = span ? (ap.u * ab.u + ap.v * ab.v) / (span * span) : 0;
    if (span && t >= 0 && t <= 1 && Math.abs(ab.u * ap.v - ab.v * ap.u) / span <= FLAT) return true;
    if (a[v] > p[v] !== b[v] > p[v] && p[u] < ((b[u] - a[u]) * (p[v] - a[v])) / (b[v] - a[v]) + a[u]) inside = !inside;
  }
  return inside;
}

/** A face that's bent, or has a side no line runs along, isn't one Wireframe would make; a hand-edited file can hold one. */
export function sound_face(face: WireFace, points: ReadonlyMap<string, WirePoint>, lines: readonly WireLine[]): boolean {
  const corners = face.points.map((id) => points.get(id));
  if (corners.some((corner) => !corner) || !is_flat(corners as WirePoint[])) return false;
  return face_sides(face).every(([a, b]) => lines.some((line) => same_side(line, a, b)));
}
