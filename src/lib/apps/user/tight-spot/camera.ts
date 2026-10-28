import type { Bounds, Vec } from "./geometry";

export interface Camera {
  x: number;
  y: number;
  /** CSS pixels per metre. */
  scale: number;
}

/** CSS pixels along each edge that something sits over (cards, touch controls), so the focus lands in the clear part. */
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

export const ZOOM_MIN = 0.4;
export const ZOOM_MAX = 2.4;
const SPAN = 26;

function clamp_axis(centre: number, half: number, lo: number, hi: number): number {
  if (half * 2 >= hi - lo) return (lo + hi) / 2;
  return Math.min(hi - half, Math.max(lo + half, centre));
}

/**
 * About 26 m across the shorter side at zoom 1, kept inside the world so the edge of the map never shows empty.
 * With insets the focus sits in the middle of the uncovered part, and the world's edge may slide under the covered strip.
 */
export function frame(bounds: Bounds, focus: Vec, width: number, height: number, zoom: number, insets: Insets = NO_INSETS): Camera {
  const scale = Math.max(1, Math.min(width, height)) / (SPAN / zoom);
  const shift_x = (insets.left - insets.right) / 2 / scale;
  const shift_y = (insets.top - insets.bottom) / 2 / scale;
  return {
    x: clamp_axis(focus.x - shift_x, width / 2 / scale, bounds.x0 - insets.left / scale, bounds.x1 + insets.right / scale),
    y: clamp_axis(focus.y - shift_y, height / 2 / scale, bounds.y0 - insets.top / scale, bounds.y1 + insets.bottom / scale),
    scale,
  };
}

export function ease(current: Camera | null, target: Camera, dt: number): Camera {
  if (!current) return target;
  const k = 1 - Math.exp(-dt * 6);
  return {
    x: current.x + (target.x - current.x) * k,
    y: current.y + (target.y - current.y) * k,
    scale: current.scale + (target.scale - current.scale) * k,
  };
}
