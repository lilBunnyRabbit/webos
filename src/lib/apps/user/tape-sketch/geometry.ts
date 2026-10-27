import { edge_count, point_map, type Point, type Sketch, type SketchPath, type SketchPoint } from "./model";

const R = Math.SQRT1_2;

export interface Direction {
  id: string;
  label: string;
  x: number;
  y: number;
}

/** Row by row, as the 3 × 3 pad shows them around its empty centre. Sketch y grows downwards. */
export const DIRECTIONS: Direction[] = [
  { id: "nw", label: "Up left", x: -R, y: -R },
  { id: "n", label: "Up", x: 0, y: -1 },
  { id: "ne", label: "Up right", x: R, y: -R },
  { id: "w", label: "Left", x: -1, y: 0 },
  { id: "e", label: "Right", x: 1, y: 0 },
  { id: "sw", label: "Down left", x: -R, y: R },
  { id: "s", label: "Down", x: 0, y: 1 },
  { id: "se", label: "Down right", x: R, y: R },
];

export function add(a: Point, b: Point): Point {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function sub(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function scale(a: Point, k: number): Point {
  return { x: a.x * k, y: a.y * k };
}

export function dot(a: Point, b: Point): number {
  return a.x * b.x + a.y * b.y;
}

export function length(a: Point): number {
  return Math.hypot(a.x, a.y);
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function unit(a: Point): Point {
  const size = length(a);
  return size > 1e-9 ? { x: a.x / size, y: a.y / size } : { x: 0, y: 0 };
}

export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function distance_to_segment(p: Point, a: Point, b: Point): number {
  const ab = sub(b, a);
  const size = dot(ab, ab);
  const t = size ? Math.max(0, Math.min(1, dot(sub(p, a), ab) / size)) : 0;
  return distance(p, add(a, scale(ab, t)));
}

/** The nearest of `directions`; the point lands at the foot of `to` on that ray, so a sloppy tap keeps its reach. */
export function snap_dir(from: Point, to: Point, directions: readonly Point[]): Point {
  const delta = sub(to, from);
  if (length(delta) < 1e-9 || !directions.length) return { ...to };
  let best = directions[0];
  for (const direction of directions) if (dot(delta, direction) > dot(delta, best)) best = direction;
  const reach = Math.max(0, dot(delta, best));
  return add(from, scale(best, reach));
}

const clean = (value: number) => Math.round(value * 1e12) / 1e12 + 0;

/** Degrees into [0, 180), deduplicated and sorted: an angle and its opposite are one line. */
export function normalize_snap(angles: readonly number[]): number[] {
  const out = new Set<number>();
  for (const angle of angles) {
    if (!Number.isFinite(angle)) continue;
    out.add(clean(Math.round((((angle % 180) + 180) % 180) * 100) / 100) % 180);
  }
  return [...out].sort((a, b) => a - b);
}

/** Every angle both ways, counter-clockwise from right; sketch y grows downwards, so up is −y. */
export function snap_directions(snap: readonly number[]): Direction[] {
  const out: Direction[] = [];
  for (const base of normalize_snap(snap)) {
    for (const degrees of [base, base + 180]) {
      const radians = (degrees * Math.PI) / 180;
      out.push({ id: `${degrees}`, label: `${degrees}°`, x: clean(Math.cos(radians)), y: clean(-Math.sin(radians)) });
    }
  }
  return out.sort((a, b) => Number(a.id) - Number(b.id));
}

export const SnapPreset = { DEG_45: "45", ISO: "iso", DEG_15: "15", CUSTOM: "custom" } as const;
export type SnapPreset = (typeof SnapPreset)[keyof typeof SnapPreset];

export interface SnapOption {
  id: SnapPreset;
  label: string;
  angles: number[];
}

export const SNAP_PRESETS: SnapOption[] = [
  { id: SnapPreset.DEG_45, label: "45°", angles: [0, 45, 90, 135] },
  { id: SnapPreset.ISO, label: "Iso", angles: [0, 30, 90, 150] },
  { id: SnapPreset.DEG_15, label: "15°", angles: Array.from({ length: 12 }, (_, i) => i * 15) },
];

export function snap_preset(snap: readonly number[]): SnapPreset {
  const key = normalize_snap(snap).join(",");
  return SNAP_PRESETS.find((preset) => preset.angles.join(",") === key)?.id ?? SnapPreset.CUSTOM;
}

/** What a file may hold (`format.ts`): more would save a sketch that can't be opened again. */
export const MAX_SNAP_ANGLES = 180;

export function parse_angles(text: string): number[] | null {
  const parts = text.split(/[\s,;]+/).map((part) => part.replace(/°$/, "")).filter(Boolean);
  if (!parts.length) return null;
  const values = parts.map(Number);
  if (values.some((value) => !Number.isFinite(value))) return null;
  const angles = normalize_snap(values);
  return angles.length <= MAX_SNAP_ANGLES ? angles : null;
}

export function nearest_direction(directions: readonly Direction[], toward: Point): Direction | null {
  let best: Direction | null = null;
  for (const direction of directions) if (!best || dot(toward, direction) > dot(toward, best)) best = direction;
  return best;
}

export function align(p: Point, neighbours: readonly Point[], threshold: number): Point {
  let x = p.x;
  let y = p.y;
  let best_x = threshold;
  let best_y = threshold;
  for (const n of neighbours) {
    const dx = Math.abs(n.x - p.x);
    const dy = Math.abs(n.y - p.y);
    if (dx < best_x) [best_x, x] = [dx, n.x];
    if (dy < best_y) [best_y, y] = [dy, n.y];
  }
  return { x, y };
}

export interface Segment {
  index: number;
  a: Point;
  b: Point;
}

export function path_points(path: SketchPath, points: ReadonlyMap<string, SketchPoint>): Point[] {
  return path.points.map((id) => points.get(id) ?? { x: 0, y: 0 });
}

export function segments(path: SketchPath, points: ReadonlyMap<string, SketchPoint>): Segment[] {
  const corners = path_points(path, points);
  const count = edge_count(path);
  return Array.from({ length: count }, (_, index) => ({
    index,
    a: corners[index],
    b: corners[(index + 1) % corners.length],
  }));
}

export function signed_area(corners: readonly Point[]): number {
  let sum = 0;
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % corners.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

export function inside_polygon(p: Point, corners: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = corners.length - 1; i < corners.length; j = i++) {
    const a = corners[i];
    const b = corners[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** A tape is good to a few mm; over a long perimeter the error adds up, so the allowance grows with it. */
export function closure_tolerance(measured_total: number): number {
  return Math.max(5, measured_total * 0.002);
}

// An unmeasured edge counts on an axis only when it really runs along it: about 3° off square still counts as square.
const INVOLVED = 0.05;

export const Axis = { X: "x", Y: "y" } as const;
export type Axis = (typeof Axis)[keyof typeof Axis];
const AXES: Axis[] = [Axis.X, Axis.Y];

export interface Implied {
  index: number;
  value: number;
}

export interface Closure {
  gap: Record<Axis, number | null>;
  implied: Implied[];
  tolerance: number;
  closes: boolean;
  complete: boolean;
}

export function closure(path: SketchPath, points: ReadonlyMap<string, SketchPoint>): Closure | null {
  if (!path.closed || !path.check || path.points.length < 3) return null;
  const directions = segments(path, points).map((segment) => unit(sub(segment.b, segment.a)));
  const measured_total = path.lengths.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  const tolerance = closure_tolerance(measured_total);

  const sums: Record<Axis, number> = { x: 0, y: 0 };
  const unknown: Record<Axis, number[]> = { x: [], y: [] };
  for (const axis of AXES) {
    path.lengths.forEach((value, i) => {
      const component = directions[i][axis];
      if (value === null) {
        if (Math.abs(component) > INVOLVED) unknown[axis].push(i);
      } else sums[axis] += value * component;
    });
  }

  const candidates = new Map<number, { value: number; weight: number }>();
  for (const axis of AXES) {
    if (unknown[axis].length !== 1) continue;
    const index = unknown[axis][0];
    const component = directions[index][axis];
    const value = -sums[axis] / component;
    const previous = candidates.get(index);
    if (!previous || Math.abs(component) > previous.weight)
      candidates.set(index, { value, weight: Math.abs(component) });
  }
  const implied: Implied[] = [];
  for (const [index, { value }] of candidates) if (value > 0) implied.push({ index, value });

  const gap: Record<Axis, number | null> = { x: null, y: null };
  for (const axis of AXES) {
    let sum = sums[axis];
    let known = true;
    for (const index of unknown[axis]) {
      const hit = implied.find((item) => item.index === index);
      if (!hit) known = false;
      else sum += hit.value * directions[index][axis];
    }
    if (known) gap[axis] = sum;
  }
  // An unmeasured edge that runs nearly square still nudges the sum; it can't be checked, but it doesn't make a gap.
  const closes = AXES.every((axis) => gap[axis] === null || Math.abs(gap[axis]!) <= tolerance);
  return { gap, implied, tolerance, closes, complete: path.lengths.every((value) => value !== null) };
}

/**
 * Edge vectors in mm, from the lengths and the drawn directions. An unmeasured edge keeps its drawn length (through
 * `k`, sketch units per mm). On a closed path the leftover is spread so the path closes: over the unmeasured edges when
 * there are any, since they have nothing to contradict, else over every edge by length (the surveyor's compass rule).
 */
export function edge_vectors(path: SketchPath, points: ReadonlyMap<string, SketchPoint>, k: number): Point[] {
  const parts = segments(path, points);
  const vectors = parts.map((segment, i) => {
    const drawn = sub(segment.b, segment.a);
    const value = path.lengths[i] ?? length(drawn) / k;
    return scale(unit(drawn), value);
  });
  if (!path.closed) return vectors;
  const residual = scale(vectors.reduce(add, { x: 0, y: 0 }), -1);
  const open = path.lengths.flatMap((value, i) => (value === null ? [i] : []));
  const takers = open.length ? open : vectors.map((_, i) => i);
  const weights = takers.map((i) => length(vectors[i]));
  const total = weights.reduce((sum, w) => sum + w, 0);
  takers.forEach((i, n) => {
    const share = total > 1e-9 ? weights[n] / total : 1 / takers.length;
    vectors[i] = add(vectors[i], scale(residual, share));
  });
  return vectors;
}

/** Sketch units per mm over this path's measured edges, so a redraw keeps the path about the size it was drawn. */
export function path_scale(path: SketchPath, points: ReadonlyMap<string, SketchPoint>): number | null {
  let drawn = 0;
  let measured = 0;
  segments(path, points).forEach((segment, i) => {
    const value = path.lengths[i];
    if (value === null) return;
    drawn += distance(segment.a, segment.b);
    measured += value;
  });
  return measured > 0 && drawn > 0 ? drawn / measured : null;
}

export function sketch_scale(sketch: Sketch): number | null {
  const points = new Map(sketch.points.map((point) => [point.id, point]));
  const ratios: number[] = [];
  for (const path of sketch.paths) {
    segments(path, points).forEach((segment, i) => {
      const value = path.lengths[i];
      const drawn = distance(segment.a, segment.b);
      if (value && drawn > 1e-6) ratios.push(drawn / value);
    });
  }
  for (const dim of sketch.dims) {
    const a = points.get(dim.a);
    const b = points.get(dim.b);
    if (!a || !b || !dim.length) continue;
    const drawn = distance(a, b);
    if (drawn > 1e-6) ratios.push(drawn / dim.length);
  }
  if (!ratios.length) return null;
  ratios.sort((a, b) => a - b);
  const middle = ratios.length >> 1;
  return ratios.length % 2 ? ratios[middle] : (ratios[middle - 1] + ratios[middle]) / 2;
}

export function rebuild(path: SketchPath, points: ReadonlyMap<string, SketchPoint>): Map<string, Point> | null {
  if (edge_count(path) === 0 || !path.check) return null;
  const k = path_scale(path, points);
  if (k === null) return null;
  const vectors = edge_vectors(path, points, k);
  const moved = new Map<string, Point>();
  const origin = points.get(path.points[0])!;
  let at: Point = { x: origin.x, y: origin.y };
  moved.set(path.points[0], at);
  for (let i = 1; i < path.points.length; i++) {
    at = add(at, scale(vectors[i - 1], k));
    moved.set(path.points[i], at);
  }
  return moved;
}

export interface Measures {
  perimeter: number;
  area: number | null;
  approximate: boolean;
}

export function measures(path: SketchPath, points: ReadonlyMap<string, SketchPoint>): Measures | null {
  if (!path.closed || path.points.length < 3 || path.lengths.some((value) => value === null)) return null;
  const perimeter = path.lengths.reduce<number>((sum, value) => sum + value!, 0);
  const vectors = edge_vectors(path, points, 1);
  const corners: Point[] = [{ x: 0, y: 0 }];
  for (let i = 0; i < vectors.length - 1; i++) corners.push(add(corners[i], vectors[i]));
  const check = closure(path, points);
  return { perimeter, area: path.check ? Math.abs(signed_area(corners)) : null, approximate: !!check && !check.closes };
}

/** At least one edge drawn and every edge given a length. */
export function all_measured(sketch: Sketch): boolean {
  const drawn = sketch.paths.filter((path) => edge_count(path) > 0);
  return drawn.length > 0 && drawn.every((path) => path.lengths.length === edge_count(path) && path.lengths.every((value) => value !== null));
}

/** A checked room measured all the way round whose lengths close. */
export function checks_out(sketch: Sketch): boolean {
  const points = point_map(sketch);
  return sketch.paths.some((path) => {
    const check = closure(path, points);
    return !!check && check.complete && check.closes;
  });
}
