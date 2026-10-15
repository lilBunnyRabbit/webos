import type { Point, Rect } from "./model";
import { pattern_hit, type Pattern } from "./raster";

/** A cel being painted in place: `data` starts as a copy of `base`, which is never written. */
export interface Surface {
  readonly base: Uint8Array;
  readonly data: Uint8Array;
  readonly width: number;
  readonly height: number;
  readonly selection: Uint8Array | null;
  /** How many dabs cover each pixel, so lifting one dab (pixel-perfect) never erases a crossing. */
  readonly coverage: Uint16Array | null;
}

export interface Ink {
  index: number;
  pattern: Pattern;
  offsets: readonly Point[];
  mirror_x: boolean;
  mirror_y: boolean;
}

export interface Bounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export function empty_bounds(): Bounds {
  return { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
}

export function bounds_rect(bounds: Bounds): Rect | null {
  if (bounds.x1 <= bounds.x0 || bounds.y1 <= bounds.y0) return null;
  return { x: bounds.x0, y: bounds.y0, width: bounds.x1 - bounds.x0, height: bounds.y1 - bounds.y0 };
}

export function union_rect(a: Rect | null, b: Rect | null): Rect | null {
  if (!a) return b;
  if (!b) return a;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y };
}

function touch(surface: Surface, ink: Ink, x: number, y: number, delta: 1 | -1, bounds: Bounds): void {
  if (x < 0 || y < 0 || x >= surface.width || y >= surface.height) return;
  const i = y * surface.width + x;
  if (surface.selection && !surface.selection[i]) return;
  if (!pattern_hit(ink.pattern, x, y)) return;
  const coverage = surface.coverage;
  if (delta > 0) {
    if (coverage) coverage[i]++;
    surface.data[i] = ink.index;
  } else {
    if (coverage && coverage[i] > 0 && --coverage[i] > 0) return;
    surface.data[i] = surface.base[i];
  }
  if (x < bounds.x0) bounds.x0 = x;
  if (y < bounds.y0) bounds.y0 = y;
  if (x + 1 > bounds.x1) bounds.x1 = x + 1;
  if (y + 1 > bounds.y1) bounds.y1 = y + 1;
}

export function dab(surface: Surface, ink: Ink, point: Point, delta: 1 | -1, bounds: Bounds): void {
  const { width, height } = surface;
  for (const offset of ink.offsets) {
    const x = point.x + offset.x;
    const y = point.y + offset.y;
    touch(surface, ink, x, y, delta, bounds);
    if (ink.mirror_x) touch(surface, ink, width - 1 - x, y, delta, bounds);
    if (ink.mirror_y) touch(surface, ink, x, height - 1 - y, delta, bounds);
    if (ink.mirror_x && ink.mirror_y) touch(surface, ink, width - 1 - x, height - 1 - y, delta, bounds);
  }
}

export function restore(surface: Surface, rect: Rect | null): void {
  if (!rect) return;
  const { width } = surface;
  for (let y = rect.y; y < rect.y + rect.height; y++) {
    const start = y * width + rect.x;
    surface.data.set(surface.base.subarray(start, start + rect.width), start);
    surface.coverage?.fill(0, start, start + rect.width);
  }
}

/**
 * One step of the pixel-perfect filter, the incremental form of `pixel_perfect()`: returns the point to lift
 * (the corner of an L the new point completes) and whether the new point joins the trail.
 */
export function pixel_perfect_step(trail: Point[], point: Point): { lift: Point | null; add: boolean } {
  const last = trail[trail.length - 1];
  if (last && last.x === point.x && last.y === point.y) return { lift: null, add: false };
  let lift: Point | null = null;
  if (trail.length >= 2) {
    const a = trail[trail.length - 2];
    const b = last!;
    const corner = (a.x === b.x || a.y === b.y) && (b.x === point.x || b.y === point.y);
    if (corner && a.x !== point.x && a.y !== point.y) lift = trail.pop()!;
  }
  trail.push(point);
  return { lift, add: true };
}
