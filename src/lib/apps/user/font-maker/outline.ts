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

function resample(points: Sample[], step: number): Sample[] {
  const out: Sample[] = [points[0]];
  let carried = 0;
  for (let index = 1; index < points.length; index++) {
    const from = points[index - 1];
    const to = points[index];
    const span = length(sub(to, from));
    let at = step - carried;
    while (at <= span) {
      const t = at / span;
      out.push({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, r: from.r + (to.r - from.r) * t });
      at += step;
    }
    carried = span - (at - step);
  }
  const last = points[points.length - 1];
  if (length(sub(last, out[out.length - 1])) > step / 3) out.push(last);
  else out[out.length - 1] = last;
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

// Mouse and touch points sit on a pixel grid, so a slow stroke is a staircase; offsetting that by a wide radius
// swings the normals and beads the edges. Even spacing tied to the width plus a few passes flatten the steps first.
function samples(stroke: Stroke, width: number): Sample[] {
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
  if (deduped.length < 3) return deduped;
  let points = resample(deduped, Math.max(MIN_STEP, width * RESAMPLE_STEP));
  for (let pass = 0; pass < SMOOTH_PASSES && points.length >= 3; pass++) points = smooth(points);
  return points;
}

function split_at_corners(points: Sample[]): Sample[][] {
  const kept = rdp(points, CENTER_TOLERANCE);
  const cuts: number[] = [];
  for (let k = 1; k < kept.length - 1; k++) {
    if (turn(points[kept[k - 1]], points[kept[k]], points[kept[k + 1]]) > CORNER_TURN) cuts.push(kept[k]);
  }
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

function dot_contour(center: Sample): Vec[] {
  const outer = center.r / Math.cos(Math.PI / 8);
  return Array.from({ length: 8 }, (_, index) => {
    const angle = -(Math.PI * 2 * index) / 8;
    return { x: center.x + Math.cos(angle) * outer, y: center.y + Math.sin(angle) * outer };
  });
}

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
      if (dot(sub(candidate, out[out.length - 1]), center_step) <= 0) return;
    }
    out.push(candidate);
    anchor = index;
  });
  return out;
}

function simplify(points: Vec[]): Vec[] {
  return rdp(points, SIDE_TOLERANCE).map((index) => points[index]);
}

function piece_outline(points: Sample[]): Vec[] {
  const total = points.reduce((sum, point, index) => (index ? sum + length(sub(point, points[index - 1])) : 0), 0);
  const widest = points.reduce((best, point) => (point.r > best.r ? point : best), points[0]);
  if (points.length < 2 || total < widest.r * 0.5) {
    const center = points.reduce(
      (sum, point) => ({ x: sum.x + point.x / points.length, y: sum.y + point.y / points.length, r: widest.r }),
      { x: 0, y: 0, r: 0 }
    );
    return dot_contour(center);
  }
  const normals = points.map((_, index) => {
    const before = points[Math.max(0, index - 1)];
    const after = points[Math.min(points.length - 1, index + 1)];
    const tangent = unit(sub(after, before));
    return { x: -tangent.y, y: tangent.x };
  });
  const left = simplify(side(points, normals, 1));
  const right = simplify(side(points, normals, -1));
  const first = points[0];
  const last = points[points.length - 1];
  const end_angle = Math.atan2(normals[points.length - 1].y, normals[points.length - 1].x);
  const start_angle = Math.atan2(-normals[0].y, -normals[0].x);
  return [
    ...left,
    ...arc(last, last.r, end_angle, CAP_STEPS),
    ...right.reverse(),
    ...arc(first, first.r, start_angle, CAP_STEPS),
  ];
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
function to_contour(points: Vec[]): Contour | null {
  const rounded: Vec[] = [];
  for (const point of points) {
    const next = { x: Math.round(point.x), y: Math.round(point.y) };
    const last = rounded.at(-1);
    if (!last || last.x !== next.x || last.y !== next.y) rounded.push(next);
  }
  while (rounded.length > 1 && rounded[0].x === rounded.at(-1)!.x && rounded[0].y === rounded.at(-1)!.y) rounded.pop();
  if (rounded.length < 3) return null;
  if (signed_area(rounded) > 0) rounded.reverse();
  return rounded.map((point, index) => {
    const before = rounded[(index - 1 + rounded.length) % rounded.length];
    const after = rounded[(index + 1) % rounded.length];
    return { ...point, on: turn(before, point, after) > SHARP_TURN };
  });
}

export function stroke_contours(stroke: Stroke, width = STROKE_WIDTH): Contour[] {
  const points = samples(stroke, width);
  if (!points.length) return [];
  const pieces = points.length < 3 ? [points] : split_at_corners(points);
  return pieces
    .map(piece_outline)
    .map(to_contour)
    .filter((contour): contour is Contour => contour !== null);
}

export function glyph_contours(strokes: readonly Stroke[], width = STROKE_WIDTH): Contour[] {
  return strokes.flatMap((stroke) => stroke_contours(stroke, width));
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
