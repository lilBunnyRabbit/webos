import { add, closure_tolerance, distance, normalize_snap, rebuild, scale, sketch_scale, type Direction } from "./geometry";
import {
  edge_count,
  new_id,
  point_map,
  same_target,
  type Dim,
  type Point,
  type Sketch,
  type SketchPath,
  type Target,
  type Unit,
} from "./model";
import { round_mm } from "./units";

export interface Added {
  sketch: Sketch;
  id: string;
}

function map_path(sketch: Sketch, id: string, change: (path: SketchPath) => SketchPath): Sketch {
  return { ...sketch, paths: sketch.paths.map((path) => (path.id === id ? change(path) : path)) };
}

export function set_unit(sketch: Sketch, unit: Unit): Sketch {
  return { ...sketch, unit };
}

export function set_snap(sketch: Sketch, snap: number[]): Sketch {
  const next = normalize_snap(snap);
  return next.length && next.join(",") !== sketch.snap.join(",") ? { ...sketch, snap: next } : sketch;
}

export function set_check(sketch: Sketch, path: string, check: boolean): Sketch {
  const item = sketch.paths.find((each) => each.id === path);
  if (!item || item.check === check) return sketch;
  return map_path(sketch, path, (each) => ({ ...each, check }));
}

export function add_point(sketch: Sketch, at: Point): Added {
  const id = new_id();
  return { sketch: { ...sketch, points: [...sketch.points, { id, x: at.x, y: at.y }] }, id };
}

export function move_point(sketch: Sketch, id: string, at: Point): Sketch {
  return {
    ...sketch,
    points: sketch.points.map((point) => (point.id === id ? { ...point, x: at.x, y: at.y } : point)),
  };
}

export function start_path(sketch: Sketch, point: string): Added {
  const id = new_id();
  return {
    sketch: { ...sketch, paths: [...sketch.paths, { id, points: [point], closed: false, lengths: [], check: true }] },
    id,
  };
}

export function append_point(sketch: Sketch, path: string, point: string, value: number | null = null): Sketch {
  return map_path(sketch, path, (item) => ({
    ...item,
    points: [...item.points, point],
    lengths: item.points.length ? [...item.lengths, value] : item.lengths,
  }));
}

export function close_path(sketch: Sketch, path: string, value: number | null = null): Sketch {
  return map_path(sketch, path, (item) =>
    item.closed || item.points.length < 3 ? item : { ...item, closed: true, lengths: [...item.lengths, value] }
  );
}

export function reverse_path(sketch: Sketch, path: string): Sketch {
  return map_path(sketch, path, (item) => ({
    ...item,
    points: [...item.points].reverse(),
    lengths: [...item.lengths].reverse(),
  }));
}

function referenced(sketch: Sketch): Set<string> {
  const used = new Set<string>();
  for (const path of sketch.paths) for (const point of path.points) used.add(point);
  for (const dim of sketch.dims) used.add(dim.a).add(dim.b);
  for (const marker of sketch.markers) used.add(marker.point);
  return used;
}

function drop_orphans(sketch: Sketch, candidates: Iterable<string>): Sketch {
  const used = referenced(sketch);
  const gone = new Set([...candidates].filter((id) => !used.has(id)));
  return gone.size ? { ...sketch, points: sketch.points.filter((point) => !gone.has(point.id)) } : sketch;
}

/** A path left with one corner isn't a path; its lone corner goes too unless something else hangs on it. */
export function finish_path(sketch: Sketch, path: string): Sketch {
  const item = sketch.paths.find((each) => each.id === path);
  if (!item || item.points.length >= 2) return sketch;
  return drop_orphans({ ...sketch, paths: sketch.paths.filter((each) => each.id !== path) }, item.points);
}

export function delete_path(sketch: Sketch, path: string): Sketch {
  const item = sketch.paths.find((each) => each.id === path);
  if (!item) return sketch;
  return drop_orphans({ ...sketch, paths: sketch.paths.filter((each) => each.id !== path) }, item.points);
}

function remove_corner(path: SketchPath, point: string): SketchPath | null {
  const index = path.points.indexOf(point);
  if (index < 0) return path;
  const points = path.points.filter((id) => id !== point);
  if (points.length < 2) return null;
  if (path.closed) {
    if (points.length < 3) return { ...path, points, closed: false, lengths: [null] };
    const before = (index - 1 + path.points.length) % path.points.length;
    const lengths = path.lengths.filter((_, i) => i !== index && i !== before);
    lengths.splice(Math.min(before, index), 0, null);
    if (index === 0) lengths.push(lengths.shift()!);
    return { ...path, points, lengths };
  }
  if (index === 0) return { ...path, points, lengths: path.lengths.slice(1) };
  if (index === path.points.length - 1) return { ...path, points, lengths: path.lengths.slice(0, -1) };
  const lengths = [...path.lengths];
  lengths.splice(index - 1, 2, null);
  return { ...path, points, lengths };
}

/** The two edges either side of a removed corner become one, unmeasured. */
export function delete_point(sketch: Sketch, point: string): Sketch {
  const paths = sketch.paths.flatMap((path) => {
    const next = remove_corner(path, point);
    return next ? [next] : [];
  });
  const dropped = sketch.paths
    .filter((path) => !paths.some((each) => each.id === path.id))
    .flatMap((path) => path.points);
  const next: Sketch = {
    ...sketch,
    points: sketch.points.filter((each) => each.id !== point),
    paths,
    dims: sketch.dims.filter((dim) => dim.a !== point && dim.b !== point),
    markers: sketch.markers.filter((marker) => marker.point !== point),
  };
  return drop_orphans(next, dropped);
}

export function add_dim(sketch: Sketch, a: string, b: string, offset: number): Added {
  const id = new_id();
  const dim: Dim = { id, a, b, length: null, offset };
  return { sketch: { ...sketch, dims: [...sketch.dims, dim] }, id };
}

export function set_dim_offset(sketch: Sketch, id: string, offset: number): Sketch {
  return { ...sketch, dims: sketch.dims.map((dim) => (dim.id === id ? { ...dim, offset } : dim)) };
}

export function delete_dim(sketch: Sketch, id: string): Sketch {
  const dim = sketch.dims.find((each) => each.id === id);
  if (!dim) return sketch;
  return drop_orphans({ ...sketch, dims: sketch.dims.filter((each) => each.id !== id) }, [dim.a, dim.b]);
}

export function add_marker(sketch: Sketch, point: string, note: string): Added {
  const id = new_id();
  return { sketch: { ...sketch, markers: [...sketch.markers, { id, point, note }] }, id };
}

export function set_marker_note(sketch: Sketch, id: string, note: string): Sketch {
  return { ...sketch, markers: sketch.markers.map((marker) => (marker.id === id ? { ...marker, note } : marker)) };
}

export function delete_marker(sketch: Sketch, id: string): Sketch {
  const marker = sketch.markers.find((each) => each.id === id);
  if (!marker) return sketch;
  return drop_orphans({ ...sketch, markers: sketch.markers.filter((each) => each.id !== id) }, [marker.point]);
}

export function add_note(sketch: Sketch, at: Point, text: string): Added {
  const id = new_id();
  return { sketch: { ...sketch, notes: [...sketch.notes, { id, x: at.x, y: at.y, text }] }, id };
}

export function set_note(sketch: Sketch, id: string, change: Partial<{ x: number; y: number; text: string }>): Sketch {
  return { ...sketch, notes: sketch.notes.map((note) => (note.id === id ? { ...note, ...change } : note)) };
}

export function delete_note(sketch: Sketch, id: string): Sketch {
  return { ...sketch, notes: sketch.notes.filter((note) => note.id !== id) };
}

export function measure_targets(sketch: Sketch): Target[] {
  const targets: Target[] = [];
  for (const path of sketch.paths) {
    for (let index = 0; index < edge_count(path); index++) targets.push({ kind: "edge", path: path.id, index });
  }
  for (const dim of sketch.dims) targets.push({ kind: "dim", id: dim.id });
  return targets;
}

export function target_exists(sketch: Sketch, target: Target): boolean {
  return measure_targets(sketch).some((each) => same_target(each, target));
}

export function length_of(sketch: Sketch, target: Target): number | null {
  if (target.kind === "edge")
    return sketch.paths.find((path) => path.id === target.path)?.lengths[target.index] ?? null;
  return sketch.dims.find((dim) => dim.id === target.id)?.length ?? null;
}

export function set_length(sketch: Sketch, target: Target, value: number | null): Sketch {
  const rounded = value === null ? null : round_mm(value);
  if (target.kind === "edge") {
    return map_path(sketch, target.path, (path) => ({
      ...path,
      lengths: path.lengths.map((each, i) => (i === target.index ? rounded : each)),
    }));
  }
  return { ...sketch, dims: sketch.dims.map((dim) => (dim.id === target.id ? { ...dim, length: rounded } : dim)) };
}

/**
 * The next target after `from`, `step` = 1 or -1, wrapping. While something is still unmeasured only those count, so
 * ← and → walk the to-do list; once everything is measured they walk all of it.
 */
export function step_target(sketch: Sketch, from: Target | null, step: 1 | -1): Target | null {
  const all = measure_targets(sketch);
  if (!all.length) return null;
  const open = all.filter((target) => length_of(sketch, target) === null);
  const pool = open.length && !(open.length === 1 && same_target(open[0], from)) ? open : all;
  const at = from ? all.findIndex((target) => same_target(target, from)) : -1;
  for (let i = 1; i <= all.length; i++) {
    const candidate = all[(((at + step * i) % all.length) + all.length) % all.length];
    if (pool.some((target) => same_target(target, candidate)) && !same_target(candidate, from)) return candidate;
  }
  return null;
}

export function unmeasured_count(sketch: Sketch): number {
  return measure_targets(sketch).filter((target) => length_of(sketch, target) === null).length;
}

export function redraw_to_scale(sketch: Sketch, path: string): Sketch {
  const item = sketch.paths.find((each) => each.id === path);
  if (!item) return sketch;
  const moved = rebuild(item, point_map(sketch));
  if (!moved) return sketch;
  return {
    ...sketch,
    points: sketch.points.map((point) => (moved.has(point.id) ? { ...point, ...moved.get(point.id)! } : point)),
  };
}

/** The path `point` ends, the one a walk from it extends; a path it starts is turned around first. */
function walk_path(sketch: Sketch, point: string): { sketch: Sketch; path: string | null } {
  const ends = sketch.paths.find((path) => !path.closed && path.points.length > 0 && path.points.at(-1) === point);
  if (ends) return { sketch, path: ends.id };
  const starts = sketch.paths.find((path) => !path.closed && path.points.length > 1 && path.points[0] === point);
  if (starts) return { sketch: reverse_path(sketch, starts.id), path: starts.id };
  return { sketch, path: null };
}

// With nothing measured there is no scale yet, so the first walked step sets it: this many sketch units long.
export const FIRST_STEP = 120;

export interface Walked {
  sketch: Sketch;
  point: string;
  path: string;
  closed: boolean;
}

export function walk(sketch: Sketch, from: string, direction: Direction, value: number): Walked {
  const k = sketch_scale(sketch) ?? FIRST_STEP / value;
  const start = sketch.points.find((point) => point.id === from)!;
  const end = add(start, scale(direction, value * k));
  const found = walk_path(sketch, from);
  let next = found.sketch;
  let path = found.path;
  if (path) {
    const item = next.paths.find((each) => each.id === path)!;
    const first = next.points.find((point) => point.id === item.points[0])!;
    const total = item.lengths.reduce<number>((sum, each) => sum + (each ?? 0), 0) + value;
    if (item.points.length >= 3 && distance(end, first) / k <= closure_tolerance(total)) {
      return { sketch: close_path(next, path, round_mm(value)), point: first.id, path, closed: true };
    }
  } else {
    const started = start_path(next, from);
    next = started.sketch;
    path = started.id;
  }
  const added = add_point(next, end);
  return { sketch: append_point(added.sketch, path, added.id, round_mm(value)), point: added.id, path, closed: false };
}
