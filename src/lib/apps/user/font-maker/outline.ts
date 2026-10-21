import { STROKE_WIDTH, type Stroke } from "./model";

export interface Vec {
  x: number;
  y: number;
}

export interface ContourPoint extends Vec {
  on: boolean;
}

export type Contour = ContourPoint[];

interface Sample extends Vec {
  r: number;
}

const MIN_STEP = 3;
const RESAMPLE_STEP = 0.12;
const SMOOTH_PASSES = 3;
const CORNER_TURN = (80 * Math.PI) / 180;
const SHARP_TURN = (70 * Math.PI) / 180;
const CAP_STEPS = 6;
const SIDE_TOLERANCE = 1.5;
const CENTER_TOLERANCE = 6;

export function radius_of(pressure: number, width = STROKE_WIDTH): number {
  return (width / 2) * (0.25 + 1.5 * Math.min(1, Math.max(0, pressure)));
}

const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
const length = (v: Vec) => Math.hypot(v.x, v.y);
const dot = (a: Vec, b: Vec) => a.x * b.x + a.y * b.y;

function unit(v: Vec): Vec {
  const size = length(v);
  return size > 0 ? { x: v.x / size, y: v.y / size } : { x: 1, y: 0 };
}

function turn(a: Vec, b: Vec, c: Vec): number {
  const one = unit(sub(b, a));
  const two = unit(sub(c, b));
  return Math.acos(Math.min(1, Math.max(-1, dot(one, two))));
}

function distance_to_segment(point: Vec, a: Vec, b: Vec): number {
  const ab = sub(b, a);
  const span = dot(ab, ab);
  if (span === 0) return length(sub(point, a));
  const t = Math.min(1, Math.max(0, dot(sub(point, a), ab) / span));
  return length(sub(point, { x: a.x + ab.x * t, y: a.y + ab.y * t }));
}

export function rdp(points: readonly Vec[], tolerance: number): number[] {
  if (points.length < 3) return points.map((_, index) => index);
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [from, to] = stack.pop()!;
    let worst = -1;
    let worst_distance = tolerance;
    for (let index = from + 1; index < to; index++) {
      const distance = distance_to_segment(points[index], points[from], points[to]);
      if (distance > worst_distance) {
        worst = index;
        worst_distance = distance;
      }
    }
    if (worst < 0) continue;
    keep[worst] = 1;
    stack.push([from, worst], [worst, to]);
  }
  const kept: number[] = [];
  keep.forEach((flag, index) => flag && kept.push(index));
  return kept;
}

function path_length(points: readonly Vec[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index++) total += length(sub(points[index], points[index - 1]));
  return total;
}

function resample(points: Sample[], count: number): Sample[] {
  if (points.length === 1 || count === 1) return Array.from({ length: count }, () => ({ ...points[0] }));
  const total = path_length(points);
  const out: Sample[] = [points[0]];
  let index = 1;
  let walked = 0;
  for (let step = 1; step < count - 1; step++) {
    const target = (total * step) / (count - 1);
    let span = length(sub(points[index], points[index - 1]));
    while (index < points.length - 1 && walked + span < target) {
      walked += span;
      index++;
      span = length(sub(points[index], points[index - 1]));
    }
    const from = points[index - 1];
    const to = points[index];
    const t = span > 0 ? Math.min(1, (target - walked) / span) : 0;
    out.push({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, r: from.r + (to.r - from.r) * t });
  }
  out.push(points[points.length - 1]);
  return out;
}

function smooth(points: Sample[]): Sample[] {
  return points.map((sample, index) => {
    if (index === 0 || index === points.length - 1) return sample;
    const before = points[index - 1];
    const after = points[index + 1];
    return {
      x: (before.x + sample.x * 2 + after.x) / 4,
      y: (before.y + sample.y * 2 + after.y) / 4,
      r: (before.r + sample.r * 2 + after.r) / 4,
    };
  });
}

function dedupe(stroke: Stroke, width: number): Sample[] {
  const deduped: Sample[] = [];
  for (const [x, y, pressure] of stroke) {
    const sample = { x, y, r: radius_of(pressure, width) };
    const last = deduped.at(-1);
    if (last && length(sub(sample, last)) < MIN_STEP) {
      last.r = Math.max(last.r, sample.r);
      continue;
    }
    deduped.push(sample);
  }
  return deduped;
}

// Mouse and touch points sit on a pixel grid, so a slow stroke is a staircase; offsetting that by a wide radius
// swings the normals and beads the edges. Even spacing tied to the width plus a few passes flatten the steps first.
// The first master sets the sample count for all of them, so every weight of a glyph outlines to the same points.
function master_samples(strokes: readonly Stroke[], widths: readonly number[], step_width: number): Sample[][] {
  const deduped = strokes.map((stroke, index) => dedupe(stroke, widths[index]));
  const base = deduped[0];
  if (base.length < 3) return deduped.map((points) => (points.length ? resample(points, Math.max(1, base.length)) : points));
  const count = Math.max(3, Math.round(path_length(base) / Math.max(MIN_STEP, step_width * RESAMPLE_STEP)) + 1);
  return deduped.map((points) => {
    let out = points.length ? resample(points, count) : points;
    for (let pass = 0; pass < SMOOTH_PASSES && out.length >= 3; pass++) out = smooth(out);
    return out;
  });
}

function corner_cuts(points: Sample[]): number[] {
  const kept = rdp(points, CENTER_TOLERANCE);
  const cuts: number[] = [];
  for (let k = 1; k < kept.length - 1; k++) {
    if (turn(points[kept[k - 1]], points[kept[k]], points[kept[k + 1]]) > CORNER_TURN) cuts.push(kept[k]);
  }
  return cuts;
}

function split_at(points: Sample[], cuts: readonly number[]): Sample[][] {
  const pieces: Sample[][] = [];
  let start = 0;
  for (const cut of cuts) {
    pieces.push(points.slice(start, cut + 1));
    start = cut;
  }
  pieces.push(points.slice(start));
  return pieces;
}

function arc(center: Vec, r: number, from: number, steps: number): Vec[] {
  const out: Vec[] = [];
  for (let step = 1; step < steps; step++) {
    const angle = from - (Math.PI * step) / steps;
    out.push({ x: center.x + Math.cos(angle) * r, y: center.y + Math.sin(angle) * r });
  }
  return out;
}

const widest = (points: Sample[]) => points.reduce((best, point) => (point.r > best.r ? point : best), points[0]);

function dot_contour(points: Sample[]): Vec[] {
  const center = points.reduce((sum, point) => ({ x: sum.x + point.x / points.length, y: sum.y + point.y / points.length }), { x: 0, y: 0 });
  const outer = widest(points).r / Math.cos(Math.PI / 8);
  return Array.from({ length: 8 }, (_, index) => {
    const angle = -(Math.PI * 2 * index) / 8;
    return { x: center.x + Math.cos(angle) * outer, y: center.y + Math.sin(angle) * outer };
  });
}

// An offset point that would step backwards against the centreline is pinned to the last good one, which removes
// the swallowtails on the inner side of tight curves while every master keeps the same point count.
function side(points: Sample[], normals: Vec[], sign: 1 | -1): Vec[] {
  const out: Vec[] = [];
  let anchor = -1;
  points.forEach((point, index) => {
    const candidate = {
      x: point.x + normals[index].x * point.r * sign,
      y: point.y + normals[index].y * point.r * sign,
    };
    if (anchor >= 0 && index < points.length - 1) {
      const center_step = sub(point, points[anchor]);
      if (dot(sub(candidate, out[out.length - 1]), center_step) <= 0) {
        out.push({ ...out[out.length - 1] });
        return;
      }
    }
    out.push(candidate);
    anchor = index;
  });
  return out;
}

function normals_of(points: Sample[]): Vec[] {
  return points.map((_, index) => {
    const before = points[Math.max(0, index - 1)];
    const after = points[Math.min(points.length - 1, index + 1)];
    const tangent = unit(sub(after, before));
    return { x: -tangent.y, y: tangent.x };
  });
}

function union_rdp(sides: Vec[][]): number[] {
  const kept = new Set<number>();
  for (const points of sides) for (const index of rdp(points, SIDE_TOLERANCE)) kept.add(index);
  return [...kept].sort((a, b) => a - b);
}

function is_dot(points: Sample[]): boolean {
  return points.length < 2 || path_length(points) < widest(points).r * 0.5;
}

function piece_outlines(pieces: Sample[][]): Vec[][] {
  if (is_dot(pieces[0])) return pieces.map(dot_contour);
  const normals = pieces.map(normals_of);
  const lefts = pieces.map((points, master) => side(points, normals[master], 1));
  const rights = pieces.map((points, master) => side(points, normals[master], -1));
  const keep_left = union_rdp(lefts);
  const keep_right = union_rdp(rights);
  return pieces.map((points, master) => {
    const first = points[0];
    const last = points[points.length - 1];
    const end = normals[master][points.length - 1];
    const start = normals[master][0];
    return [
      ...keep_left.map((index) => lefts[master][index]),
      ...arc(last, last.r, Math.atan2(end.y, end.x), CAP_STEPS),
      ...keep_right.map((index) => rights[master][index]).reverse(),
      ...arc(first, first.r, Math.atan2(-start.y, -start.x), CAP_STEPS),
    ];
  });
}

export function signed_area(points: readonly Vec[]): number {
  let area = 0;
  for (let index = 0; index < points.length; index++) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2;
}

// All points off-curve make a quadratic B-spline through the implied midpoints; sharp corners stay on-curve.
// A point is dropped only where it repeats in every master; the first master decides winding and flags.
function to_contours(masters: Vec[][]): Contour[] | null {
  const rounded = masters.map((points) => points.map((point) => ({ x: Math.round(point.x), y: Math.round(point.y) })));
  const same = (a: Vec, b: Vec) => a.x === b.x && a.y === b.y;
  const kept: number[] = [];
  for (let index = 0; index < rounded[0].length; index++) {
    const previous = kept.at(-1);
    if (previous === undefined || !rounded.every((points) => same(points[index], points[previous]))) kept.push(index);
  }
  while (kept.length > 1 && rounded.every((points) => same(points[kept[0]], points[kept.at(-1)!]))) kept.pop();
  if (kept.length < 3) return null;
  const picked = rounded.map((points) => kept.map((index) => points[index]));
  if (signed_area(picked[0]) > 0) picked.forEach((points) => points.reverse());
  const base = picked[0];
  const on = base.map((point, index) => turn(base[(index - 1 + base.length) % base.length], point, base[(index + 1) % base.length]) > SHARP_TURN);
  return picked.map((points) => points.map((point, index) => ({ ...point, on: on[index] })));
}

/**
 * One stroke outlined at several masters (the weights of a glyph), all with the same contours and point counts: the
 * first master sets the sample count, corner cuts, dots, winding and on-curve flags. `step_width` sets the sample
 * spacing, so a stroke samples the same at every weight.
 */
export function stroke_masters(strokes: readonly Stroke[], widths: readonly number[], step_width = widths[0]): Contour[][] {
  const samples = master_samples(strokes, widths, step_width);
  if (samples.some((points) => !points.length)) return strokes.map(() => []);
  const cuts = samples[0].length < 3 ? [] : corner_cuts(samples[0]);
  const pieces = samples.map((points) => split_at(points, cuts));
  const out: Contour[][] = strokes.map(() => []);
  pieces[0].forEach((_, piece) => {
    to_contours(piece_outlines(pieces.map((master) => master[piece])))?.forEach((contour, master) => out[master].push(contour));
  });
  return out;
}

export function stroke_contours(stroke: Stroke, width = STROKE_WIDTH, step_width = width): Contour[] {
  return stroke_masters([stroke], [width], step_width)[0];
}

export function glyph_contours(strokes: readonly Stroke[], width = STROKE_WIDTH, step_width = width): Contour[] {
  return strokes.flatMap((stroke) => stroke_contours(stroke, width, step_width));
}

/** One glyph outlined at several masters, point for point; `null` when their stroke counts differ. */
export function glyph_masters(masters: readonly (readonly Stroke[])[], widths: readonly number[], step_width: number): Contour[][] | null {
  const count = masters[0].length;
  if (masters.some((strokes) => strokes.length !== count)) return null;
  const out: Contour[][] = masters.map(() => []);
  for (let index = 0; index < count; index++) {
    const strokes = masters.map((list) => list[index]);
    stroke_masters(strokes, widths, step_width).forEach((contours, master) => out[master].push(...contours));
  }
  return out;
}

export interface Bounds {
  x_min: number;
  y_min: number;
  x_max: number;
  y_max: number;
}

export function contour_bounds(contours: readonly Contour[]): Bounds | null {
  let bounds: Bounds | null = null;
  for (const contour of contours) {
    for (const { x, y } of contour) {
      if (!bounds) bounds = { x_min: x, y_min: y, x_max: x, y_max: y };
      else {
        bounds.x_min = Math.min(bounds.x_min, x);
        bounds.y_min = Math.min(bounds.y_min, y);
        bounds.x_max = Math.max(bounds.x_max, x);
        bounds.y_max = Math.max(bounds.y_max, y);
      }
    }
  }
  return bounds;
}

export function contours_path(contours: readonly Contour[]): string {
  const parts: string[] = [];
  for (const contour of contours) {
    const count = contour.length;
    const mid = (a: ContourPoint, b: ContourPoint) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    const start_index = contour.findIndex((point) => point.on);
    const start = start_index >= 0 ? contour[start_index] : mid(contour[count - 1], contour[0]);
    const offset = start_index >= 0 ? start_index : 0;
    parts.push(`M${start.x} ${start.y}`);
    let pending: ContourPoint | null = null;
    for (let step = start_index >= 0 ? 1 : 0; step <= count; step++) {
      const point = contour[(offset + step) % count];
      const closing = step === count;
      if (point.on || (closing && start_index >= 0)) {
        if (pending) parts.push(`Q${pending.x} ${pending.y} ${point.x} ${point.y}`);
        else parts.push(`L${point.x} ${point.y}`);
        pending = null;
      } else if (closing) {
        if (pending) parts.push(`Q${pending.x} ${pending.y} ${start.x} ${start.y}`);
      } else {
        if (pending) {
          const between = mid(pending, point);
          parts.push(`Q${pending.x} ${pending.y} ${between.x} ${between.y}`);
        }
        pending = point;
      }
    }
    parts.push("Z");
  }
  return parts.join("");
}
