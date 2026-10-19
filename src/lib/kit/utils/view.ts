export const MIN_SCALE = 0.05;
export const MAX_SCALE = 64;

export interface View {
  scale: number;
  offset_x: number;
  offset_y: number;
}

export interface Point {
  x: number;
  y: number;
}

export function to_screen(view: View, x: number, y: number): Point {
  return { x: x * view.scale + view.offset_x, y: y * view.scale + view.offset_y };
}

export function to_image(view: View, sx: number, sy: number): Point {
  return { x: (sx - view.offset_x) / view.scale, y: (sy - view.offset_y) / view.scale };
}

export function clamp_scale(scale: number): number {
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale));
}

/** View that fits a `width` × `height` image into a `cw` × `ch` viewport with a margin. */
export function fit_view(width: number, height: number, cw: number, ch: number, margin = 24): View {
  const scale = clamp_scale(Math.min((cw - margin * 2) / width, (ch - margin * 2) / height));
  return { scale, offset_x: (cw - width * scale) / 2, offset_y: (ch - height * scale) / 2 };
}

/** Zooms by `factor` keeping the screen point under (`sx`, `sy`) still. */
export function zoom_view(view: View, factor: number, sx: number, sy: number): View {
  const scale = clamp_scale(view.scale * factor);
  const k = scale / view.scale;
  return { scale, offset_x: sx - (sx - view.offset_x) * k, offset_y: sy - (sy - view.offset_y) * k };
}

/** Two-finger view: the image point that was under the starting midpoint follows the midpoint, scaled by the spread. */
export function pinch_view(start: View, start_mid: Point, start_distance: number, mid: Point, distance: number): View {
  const scale = clamp_scale(start.scale * (distance / Math.max(1, start_distance)));
  const anchor = to_image(start, start_mid.x, start_mid.y);
  return { scale, offset_x: mid.x - anchor.x * scale, offset_y: mid.y - anchor.y * scale };
}
