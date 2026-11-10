import { z } from "zod";
import { round_mm } from "$kit/components/length-pad/keys";
import { add_face, add_line, ensure_point } from "./edit";
import { face_lines } from "./faces";
import { check_references, FacesSchema, LinesSchema, PointsSchema, type Shape } from "./format";
import { add3, sub3, UNITS, type Unit, type Vec3, type Wire, type WirePoint } from "./model";

export type Part = Shape;

export const CLIP_TAG = 2;

const ClipSchema = z.object({
  wireframe: z.literal(CLIP_TAG),
  unit: z.enum(UNITS),
  points: PointsSchema.min(1),
  lines: LinesSchema,
  faces: FacesSchema,
});

export function extract_part(wire: Wire, points: readonly string[], lines: readonly string[], faces: readonly string[]): Part {
  const line_ids = new Set([...lines, ...face_lines(wire, faces)]);
  const picked_lines = wire.lines.filter((line) => line_ids.has(line.id));
  const point_ids = new Set([
    ...points,
    ...picked_lines.flatMap((line) => [line.a, line.b]),
    ...wire.faces.filter((face) => faces.includes(face.id)).flatMap((face) => face.points),
  ]);
  return {
    points: wire.points.filter((point) => point_ids.has(point.id)),
    lines: picked_lines,
    faces: wire.faces.filter((face) => face.points.every((id) => point_ids.has(id))),
  };
}

/** The lowest corner, then the front, then the left: where a part copied with no handle picked is held. */
export function anchor_of(part: Part): WirePoint | null {
  let best: WirePoint | null = null;
  for (const point of part.points)
    if (!best || point.z < best.z || (point.z === best.z && (point.y < best.y || (point.y === best.y && point.x < best.x))))
      best = point;
  return best;
}

/** A corner that lands on a point joins it. */
export function place_part(wire: Wire, part: Part, shift: Vec3): { wire: Wire; lines: string[]; faces: string[] } {
  let next = wire;
  const map = new Map<string, string>();
  for (const point of part.points) {
    const added = ensure_point(next, add3(point, shift));
    next = added.wire;
    map.set(point.id, added.id);
  }
  const lines: string[] = [];
  for (const line of part.lines) {
    const added = add_line(next, map.get(line.a)!, map.get(line.b)!, line.color);
    next = added.wire;
    if (added.id) lines.push(added.id);
  }
  const faces: string[] = [];
  for (const face of part.faces) {
    const added = add_face(next, face.points.map((id) => map.get(id)!), face.color);
    next = added.wire;
    if (added.id) faces.push(added.id);
  }
  return { wire: next, lines, faces };
}

export function clip_text(part: Part, unit: Unit): string | null {
  const anchor = anchor_of(part);
  if (!anchor) return null;
  const relative = (p: Vec3) => {
    const d = sub3(p, anchor);
    return { x: round_mm(d.x) + 0, y: round_mm(d.y) + 0, z: round_mm(d.z) + 0 };
  };
  return JSON.stringify({
    wireframe: CLIP_TAG,
    unit,
    points: part.points.map((point) => ({ id: point.id, ...relative(point) })),
    lines: part.lines.map(({ id, a, b, color }) => ({ id, a, b, color })),
    faces: part.faces.map(({ id, points, color }) => ({ id, points, color })),
  });
}

export function parse_clip(text: string): Part | null {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  const result = ClipSchema.safeParse(json);
  if (!result.success) return null;
  const part: Part = { points: result.data.points, lines: result.data.lines, faces: result.data.faces };
  try {
    check_references(part);
  } catch {
    return null;
  }
  return part;
}
