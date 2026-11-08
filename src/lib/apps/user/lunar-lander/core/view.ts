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

/**
 * The height the camera frames: the centre of mass over the ground, less the legs' reach as built. Not the feet's height
 * now: a turn swings one foot down, and the view breathed with every turn.
 */
export function camera_height(ship_y: number, ground: number, lowest_foot: number): number {
  return Math.max(0, ship_y + lowest_foot - ground);
}

export interface SpanEase {
  span: number;
  chasing: boolean;
}

const SPAN_BAND = 0.06;
const SPAN_RATE = 1.2;

/**
 * Zoom follows the span slowly and only past a band: a hover bobbing a metre, or a climb rate that wobbles, leaves the
 * view still. Once outside the band it eases all the way to the target, then rests again.
 */
export function ease_span(current: SpanEase | null, target: number, dt: number): SpanEase {
  if (!current || dt <= 0) return current ?? { span: target, chasing: false };
  const off = Math.abs(Math.log(target / current.span));
  const chasing = current.chasing ? off > 0.01 : off > SPAN_BAND;
  if (!chasing) return { span: current.span, chasing: false };
  return { span: current.span * Math.exp(Math.log(target / current.span) * (1 - Math.exp(-dt * SPAN_RATE))), chasing: true };
}
