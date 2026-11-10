import { add_face } from "./edit";
import { face_sides, point_map, same_side, sub3, type Ink, type Vec3, type Wire, type WirePoint } from "./model";

export const FillRefusal = {
  NO_LOOP: "These lines don't close a loop",
  NOT_FLAT: "The loop isn't flat",
  FILLED: "That loop is already filled",
} as const;
export type FillRefusal = (typeof FillRefusal)[keyof typeof FillRefusal];

// Coordinates are rounded to 0.01 mm, so a loop drawn flat is off its plane by far less than this.
const FLAT = 0.05;

export function loop_of(wire: Wire, line_ids: readonly string[]): string[] | null {
  const picked = new Set(line_ids);
  const lines = wire.lines.filter((line) => picked.has(line.id));
  if (lines.length < 3) return null;
  const next = new Map<string, string[]>();
  for (const line of lines) {
    next.set(line.a, [...(next.get(line.a) ?? []), line.b]);
    next.set(line.b, [...(next.get(line.b) ?? []), line.a]);
  }
  if ([...next.values()].some((ends) => ends.length !== 2)) return null;
  const loop = [lines[0].a];
  let previous = lines[0].a;
  let at = lines[0].b;
  while (at !== loop[0]) {
    loop.push(at);
    const [p, q] = next.get(at)!;
    const step = p === previous ? q : p;
    previous = at;
    at = step;
  }
  return loop.length === lines.length ? loop : null;
}

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

export function is_flat(points: readonly Vec3[]): boolean {
  const n = normal_of(points);
  const length = Math.hypot(n.x, n.y, n.z);
  if (length < 1e-9) return false;
  const unit = { x: n.x / length, y: n.y / length, z: n.z / length };
  return points.every((point) => {
    const d = sub3(point, points[0]);
    return Math.abs(d.x * unit.x + d.y * unit.y + d.z * unit.z) <= FLAT;
  });
}

/** The edges' most common colour; a tie goes to the first edge round the loop. */
function common_color(wire: Wire, loop: readonly string[]): Ink {
  const counts = new Map<Ink, number>();
  for (const [a, b] of face_sides({ id: "", points: [...loop], color: null })) {
    const line = wire.lines.find((each) => same_side(each, a, b));
    if (line) counts.set(line.color, (counts.get(line.color) ?? 0) + 1);
  }
  let best: Ink = null;
  let most = 0;
  for (const [color, count] of counts)
    if (count > most) {
      best = color;
      most = count;
    }
  return best;
}

export function fill(wire: Wire, line_ids: readonly string[]): { wire: Wire; id: string } | { refused: FillRefusal } {
  const loop = loop_of(wire, line_ids);
  if (!loop) return { refused: FillRefusal.NO_LOOP };
  const points = point_map(wire);
  if (!is_flat(loop.map((id) => points.get(id) as WirePoint))) return { refused: FillRefusal.NOT_FLAT };
  const added = add_face(wire, loop, common_color(wire, loop));
  return added.id ? { wire: added.wire, id: added.id } : { refused: FillRefusal.FILLED };
}

export function face_lines(wire: Wire, face_ids: readonly string[]): string[] {
  const picked = new Set(face_ids);
  const sides = wire.faces.filter((face) => picked.has(face.id)).flatMap(face_sides);
  return wire.lines.filter((line) => sides.some(([a, b]) => same_side(line, a, b))).map((line) => line.id);
}
