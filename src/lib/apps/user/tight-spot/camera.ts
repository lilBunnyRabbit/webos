import type { Bounds, Vec } from "./geometry";

export interface Camera {
  x: number;
  y: number;
  /** CSS pixels per metre. */
  scale: number;
}

export const ZOOM_MIN = 0.4;
export const ZOOM_MAX = 2.4;
const SPAN = 26;

function clamp_axis(centre: number, half: number, lo: number, hi: number): number {
  if (half * 2 >= hi - lo) return (lo + hi) / 2;
  return Math.min(hi - half, Math.max(lo + half, centre));
}

/** About 26 m across the shorter side at zoom 1, kept inside the world so the edge of the map never shows empty. */
export function frame(bounds: Bounds, focus: Vec, width: number, height: number, zoom: number): Camera {
  const scale = Math.max(1, Math.min(width, height)) / (SPAN / zoom);
  return {
    x: clamp_axis(focus.x, width / 2 / scale, bounds.x0, bounds.x1),
    y: clamp_axis(focus.y, height / 2 / scale, bounds.y0, bounds.y1),
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
