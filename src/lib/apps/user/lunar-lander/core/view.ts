// The kit's zoom stops at 2.4 over the auto span; a lander high above the ground needs to come closer than that.
export const ZOOM_MIN = 0.4;
export const ZOOM_MAX = 8;

export function clamp_view_zoom(zoom: number): number {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom));
}

const LOW_PIXELS = 32;

/**
 * The fewest pixels the ship may shrink to. High up, as in Airfield, 14 % of the board's shorter side (55 to 80); near
 * the ground it may shrink to 32, so the ground under it stays in the view for the landing.
 */
export function ship_pixels(side: number, height = Infinity): number {
  const high = Math.min(80, Math.max(55, side * 0.14));
  const t = Math.max(0, Math.min(1, (height - 40) / 120));
  return LOW_PIXELS + (high - LOW_PIXELS) * t * t * (3 - 2 * t);
}

export interface SpanInput {
  /** The feet's height above the ground under them. */
  height: number;
  /** The board's shorter side and the clear part's height, CSS pixels. */
  side: number;
  clear: number;
  /** The ship's widest extent, metres. */
  size: number;
  tall: boolean;
}

/**
 * Metres across the board's shorter side at zoom 1: grows with height and keeps the ground under the ship in sight,
 * but never so wide that the ship drops under its pixel floor. High up the ground leaves the view; the profile strip
 * shows it then.
 */
export function view_span({ height, side, clear, size, tall }: SpanInput): number {
  const k = Math.max(1, size / 9);
  const grown = (tall ? 24 : 30) * k + 0.9 * Math.min(height, 80) + 0.4 * Math.max(0, height - 80);
  const fit = ((height + 14 * k) * side) / (0.7 * Math.max(1, clear));
  const floor = (side * size) / ship_pixels(side, height);
  return Math.min(520 * k, floor, Math.max(grown, fit));
}
