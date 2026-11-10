import {
  add3,
  axis_vector,
  face_sides,
  new_id,
  point_map,
  same_place,
  same_side,
  scale3,
  type Axis,
  type Ink,
  type Sign,
  type Unit,
  type Vec3,
  type Wire,
  type WireFace,
  type WireLine,
  type WirePoint,
} from "./model";
import { round_mm } from "$kit/components/length-pad/keys";
import { is_flat } from "./plane";

const clean = (p: Vec3): Vec3 => ({ x: round_mm(p.x) + 0, y: round_mm(p.y) + 0, z: round_mm(p.z) + 0 });

export function point_at(wire: Wire, p: Vec3): WirePoint | null {
  return wire.points.find((point) => same_place(point, p)) ?? null;
}

/** Reuses a point already at `p`, so two strokes that end in the same place share their corner. */
export function ensure_point(wire: Wire, p: Vec3): { wire: Wire; id: string } {
  const at = clean(p);
  const existing = point_at(wire, at);
  if (existing) return { wire, id: existing.id };
  const id = new_id();
  return { wire: { ...wire, points: [...wire.points, { id, ...at }] }, id };
}

function has_line(wire: Wire, a: string, b: string): boolean {
  return wire.lines.some((line) => (line.a === a && line.b === b) || (line.a === b && line.b === a));
}

export function add_line(wire: Wire, a: string, b: string, color: Ink): { wire: Wire; id: string | null } {
  if (a === b || has_line(wire, a, b)) return { wire, id: null };
  const id = new_id();
  return { wire: { ...wire, lines: [...wire.lines, { id, a, b, color }] }, id };
}

export function position(wire: Wire, id: string | null): Vec3 | null {
  if (id === null) return null;
  return wire.points.find((point) => point.id === id) ?? null;
}

export function walk_end(from: Vec3, axis: Axis, sign: Sign, length: number): Vec3 {
  return clean(add3(from, scale3(axis_vector(axis, sign), length)));
}

export function walk(
  wire: Wire,
  from: string | null,
  axis: Axis,
  sign: Sign,
  length: number,
  color: Ink
): { wire: Wire; point: string } {
  const start = from === null ? ensure_point(wire, { x: 0, y: 0, z: 0 }) : { wire, id: from };
  const origin = position(start.wire, start.id)!;
  const end = ensure_point(start.wire, walk_end(origin, axis, sign, length));
  return { wire: add_line(end.wire, start.id, end.id, color).wire, point: end.id };
}

export function add_offset_point(wire: Wire, from: string | null, offset: Vec3): { wire: Wire; id: string } {
  const base = position(wire, from) ?? { x: 0, y: 0, z: 0 };
  return ensure_point(wire, add3(base, offset));
}

/** A face that only some of the moved points belong to can end up bent; it goes, as a bent face can't be made. */
function flat_faces(wire: Wire): Wire {
  const points = point_map(wire);
  const faces = wire.faces.filter((face) => is_flat(face.points.map((id) => points.get(id)!)));
  return faces.length === wire.faces.length ? wire : { ...wire, faces };
}

export function move_points(wire: Wire, ids: readonly string[], axis: Axis, distance: number): Wire {
  if (!ids.length || !distance) return wire;
  const moving = new Set(ids);
  const shift = scale3(axis_vector(axis), distance);
  return flat_faces({
    ...wire,
    points: wire.points.map((point) => (moving.has(point.id) ? { ...point, ...clean(add3(point, shift)) } : point)),
  });
}

/**
 * Deleting lines also drops their ends when nothing else holds them; a point that never had a line stays.
 * A face goes with any of its points or with a deleted line along one of its sides.
 */
export function delete_items(
  wire: Wire,
  points: readonly string[],
  lines: readonly string[],
  faces: readonly string[] = []
): Wire {
  const gone_points = new Set(points);
  const gone_lines = new Set(lines);
  const gone_faces = new Set(faces);
  const kept = wire.lines.filter(
    (line) => !gone_lines.has(line.id) && !gone_points.has(line.a) && !gone_points.has(line.b)
  );
  const cut = wire.lines.filter((line) => !kept.includes(line));
  const ends = new Set(wire.lines.filter((line) => gone_lines.has(line.id)).flatMap((line) => [line.a, line.b]));
  const used = new Set(kept.flatMap((line) => [line.a, line.b]));
  const kept_points = wire.points.filter(
    (point) => !gone_points.has(point.id) && (!ends.has(point.id) || used.has(point.id))
  );
  const alive = new Set(kept_points.map((point) => point.id));
  return {
    ...wire,
    points: kept_points,
    lines: kept,
    faces: wire.faces.filter(
      (face) =>
        !gone_faces.has(face.id) &&
        face.points.every((id) => alive.has(id)) &&
        !face_sides(face).some(([a, b]) => cut.some((line) => same_side(line, a, b)))
    ),
  };
}

export function set_color(wire: Wire, lines: readonly string[], color: Ink, faces: readonly string[] = []): Wire {
  const picked = new Set(lines);
  const picked_faces = new Set(faces);
  const changes =
    wire.lines.some((line) => picked.has(line.id) && line.color !== color) ||
    wire.faces.some((face) => picked_faces.has(face.id) && face.color !== color);
  if (!changes) return wire;
  return {
    ...wire,
    lines: wire.lines.map((line) => (picked.has(line.id) ? { ...line, color } : line)),
    faces: wire.faces.map((face) => (picked_faces.has(face.id) ? { ...face, color } : face)),
  };
}

export function set_unit(wire: Wire, unit: Unit): Wire {
  return wire.unit === unit ? wire : { ...wire, unit };
}

/** W along X, D along Y, H along Z; a negative size grows the other way. */
export function add_box(
  wire: Wire,
  from: string | null,
  size: Vec3,
  color: Ink
): { wire: Wire; lines: string[]; corner: string } {
  const base = position(wire, from) ?? { x: 0, y: 0, z: 0 };
  let next = wire;
  const ids: string[] = [];
  for (const dz of [0, size.z])
    for (const dy of [0, size.y])
      for (const dx of [0, size.x]) {
        const added = ensure_point(next, add3(base, { x: dx, y: dy, z: dz }));
        next = added.wire;
        ids.push(added.id);
      }
  const edges = [
    [0, 1],
    [2, 3],
    [4, 5],
    [6, 7],
    [0, 2],
    [1, 3],
    [4, 6],
    [5, 7],
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7],
  ];
  const lines: string[] = [];
  for (const [a, b] of edges) {
    const added = add_line(next, ids[a], ids[b], color);
    next = added.wire;
    if (added.id) lines.push(added.id);
  }
  return { wire: next, lines, corner: ids[0] };
}

function lines_by_id(wire: Wire, ids: readonly string[]): WireLine[] {
  const picked = new Set(ids);
  return wire.lines.filter((line) => picked.has(line.id));
}

function copy_lines(
  wire: Wire,
  lines: readonly WireLine[],
  shift: Vec3
): { wire: Wire; map: Map<string, string>; lines: string[] } {
  const points = point_map(wire);
  const map = new Map<string, string>();
  let next = wire;
  const copied: string[] = [];
  const copy_of = (id: string) => {
    const known = map.get(id);
    if (known) return known;
    const added = ensure_point(next, add3(points.get(id)!, shift));
    next = added.wire;
    map.set(id, added.id);
    return added.id;
  };
  for (const line of lines) {
    const a = copy_of(line.a);
    const b = copy_of(line.b);
    const added = add_line(next, a, b, line.color);
    next = added.wire;
    if (added.id) copied.push(added.id);
  }
  for (const face of wire.faces.filter((each) => sides_among(each, lines)))
    next = add_face(next, face.points.map((id) => map.get(id)!), face.color).wire;
  return { wire: next, map, lines: copied };
}

export function sides_among(face: WireFace, lines: readonly WireLine[]): boolean {
  return face_sides(face).every(([a, b]) => lines.some((line) => same_side(line, a, b)));
}

function clean_loop(points: readonly string[]): string[] | null {
  const loop = points.filter((id, i) => id !== points[(i + 1) % points.length]);
  return loop.length >= 3 && new Set(loop).size === loop.length ? loop : null;
}

const loop_key = (points: readonly string[]) => [...points].sort().join(":");

export function add_face(wire: Wire, points: readonly string[], color: Ink): { wire: Wire; id: string | null } {
  const loop = clean_loop(points);
  if (!loop) return { wire, id: null };
  const key = loop_key(loop);
  if (wire.faces.some((face) => loop_key(face.points) === key)) return { wire, id: null };
  const id = new_id();
  return { wire: { ...wire, faces: [...wire.faces, { id, points: loop, color }] }, id };
}

export function extrude(
  wire: Wire,
  line_ids: readonly string[],
  axis: Axis,
  length: number
): { wire: Wire; lines: string[] } {
  const lines = lines_by_id(wire, line_ids);
  if (!lines.length || !length) return { wire, lines: [] };
  const copied = copy_lines(wire, lines, scale3(axis_vector(axis), length));
  let next = copied.wire;
  const joins: string[] = [];
  for (const [original, copy] of copied.map) {
    const color = lines.find((line) => line.a === original || line.b === original)?.color ?? null;
    const added = add_line(next, original, copy, color);
    next = added.wire;
    if (added.id) joins.push(added.id);
  }
  return { wire: next, lines: [...copied.lines, ...joins] };
}

export function copy_along(
  wire: Wire,
  line_ids: readonly string[],
  axis: Axis,
  step: number,
  count: number
): { wire: Wire; lines: string[] } {
  const lines = lines_by_id(wire, line_ids);
  if (!lines.length || !step || count < 1) return { wire, lines: [] };
  let next = wire;
  const all: string[] = [];
  for (let i = 1; i <= count; i++) {
    const copied = copy_lines(next, lines, scale3(axis_vector(axis), step * i));
    next = copied.wire;
    all.push(...copied.lines);
  }
  return { wire: next, lines: all };
}

/** Lines and faces that collapse onto one point, or double another, go. */
function remap(wire: Wire, keep: WirePoint[], into: ReadonlyMap<string, string>): Wire {
  const lines: WireLine[] = [];
  const seen = new Set<string>();
  for (const line of wire.lines) {
    const a = into.get(line.a) ?? line.a;
    const b = into.get(line.b) ?? line.b;
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    if (a === b || seen.has(key)) continue;
    seen.add(key);
    lines.push({ ...line, a, b });
  }
  const faces: WireFace[] = [];
  const filled = new Set<string>();
  for (const face of wire.faces) {
    const loop = clean_loop(face.points.map((id) => into.get(id) ?? id));
    if (!loop || filled.has(loop_key(loop))) continue;
    filled.add(loop_key(loop));
    faces.push({ ...face, points: loop });
  }
  return { ...wire, points: keep, lines, faces };
}

export function merge_coincident(wire: Wire): { wire: Wire; merged: number } {
  const keep: WirePoint[] = [];
  const into = new Map<string, string>();
  for (const point of wire.points) {
    const same = keep.find((other) => same_place(other, point));
    if (same) into.set(point.id, same.id);
    else keep.push(point);
  }
  if (!into.size) return { wire, merged: 0 };
  return { wire: remap(wire, keep, into), merged: into.size };
}

/** A moved point that lands on one that stayed merges into it, as every edit does. */
export function translate(wire: Wire, ids: readonly string[], shift: Vec3): Wire {
  if (!ids.length || (!shift.x && !shift.y && !shift.z)) return wire;
  const moving = new Set(ids);
  const moved = wire.points.map((point) => (moving.has(point.id) ? { ...point, ...clean(add3(point, shift)) } : point));
  const staying = moved.filter((point) => !moving.has(point.id));
  const into = new Map<string, string>();
  for (const point of moved) {
    if (!moving.has(point.id)) continue;
    const same = staying.find((other) => same_place(other, point));
    if (same) into.set(point.id, same.id);
  }
  const next = { ...wire, points: moved };
  return flat_faces(into.size ? remap(next, moved.filter((point) => !into.has(point.id)), into) : next);
}

export function line_points(wire: Wire, line_ids: readonly string[]): string[] {
  return [...new Set(lines_by_id(wire, line_ids).flatMap((line) => [line.a, line.b]))];
}

export function bounds3(wire: Wire): { min: Vec3; max: Vec3 } | null {
  if (!wire.points.length) return null;
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const point of wire.points) {
    for (const axis of ["x", "y", "z"] as const) {
      min[axis] = Math.min(min[axis], point[axis]);
      max[axis] = Math.max(max[axis], point[axis]);
    }
  }
  return { min, max };
}

export function center3(wire: Wire): Vec3 {
  const box = bounds3(wire);
  if (!box) return { x: 0, y: 0, z: 0 };
  return { x: (box.min.x + box.max.x) / 2, y: (box.min.y + box.max.y) / 2, z: (box.min.z + box.max.z) / 2 };
}
