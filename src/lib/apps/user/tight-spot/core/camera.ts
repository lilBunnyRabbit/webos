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
// Must equal the `aspect-ratio > 1.25` container query in drive-frame.svelte: past it the touch controls cover the board's sides.
export const OVERLAY_ASPECT = 1.25;
export const OVERLAY_GAP = 20;

export function clamp_zoom(zoom: number): number {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom));
}
const SPAN = 26;

function clamp_axis(centre: number, half: number, lo: number, hi: number): number {
  if (half * 2 >= hi - lo) return (lo + hi) / 2;
  return Math.min(hi - half, Math.max(lo + half, centre));
}

const HATCH_LENGTH = 4.3;
const MAX_STRETCH = 1.6;
const MIN_STRETCH = 0.6;

/**
 * How much more ground than the hatchback's a vehicle of this length is shown, both ways: a bus fills about the share
 * of the screen a hatchback does, a trolley is not a speck. Capped at both ends, or bay lines and kerbs would shrink to
 * hairlines on a phone, or a lot would be too close to read.
 */
export function view_stretch(length: number): number {
  return Math.min(MAX_STRETCH, Math.max(MIN_STRETCH, length / HATCH_LENGTH));
}

/** Metres across the shorter side at zoom 1: 26 for the hatchback, scaled by `view_stretch`. */
export function view_span(length: number): number {
  return SPAN * view_stretch(length);
}

/**
 * Kept inside the world so the edge of the map never shows empty. With insets the focus sits in the middle of the
 * uncovered part, and the world's edge may slide under the covered strip.
 */
export function frame(
  bounds: Bounds,
  focus: Vec,
  width: number,
  height: number,
  zoom: number,
  insets: Insets = NO_INSETS,
  span = SPAN
): Camera {
  const scale = Math.max(1, Math.min(width, height)) / (span / zoom);
  const shift_x = (insets.left - insets.right) / 2 / scale;
  const shift_y = (insets.top - insets.bottom) / 2 / scale;
  return {
    x: clamp_axis(focus.x - shift_x, width / 2 / scale, bounds.x0 - insets.left / scale, bounds.x1 + insets.right / scale),
    y: clamp_axis(focus.y - shift_y, height / 2 / scale, bounds.y0 - insets.top / scale, bounds.y1 + insets.bottom / scale),
    scale,
  };
}

/** The span that shows all of `bounds`, plus `margin` metres round it, in the part the insets leave clear, at zoom 1. */
export function fit_span(bounds: Bounds, width: number, height: number, insets: Insets = NO_INSETS, margin = 0): number {
  const clear_width = Math.max(1, width - insets.left - insets.right);
  const clear_height = Math.max(1, height - insets.top - insets.bottom);
  const scale = Math.min(clear_width / (bounds.x1 - bounds.x0 + margin * 2), clear_height / (bounds.y1 - bounds.y0 + margin * 2));
  return Math.max(1, Math.min(width, height)) / scale;
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
