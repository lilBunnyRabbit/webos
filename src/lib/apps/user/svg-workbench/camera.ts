/** Offsets move the image's centre away from the pane's centre, in screen px. */
export interface Camera {
  scale: number;
  x: number;
  y: number;
}

export interface Point {
  x: number;
  y: number;
}

export const FIT: Camera = { scale: 1, x: 0, y: 0 };
export const MAX_ZOOM = 32;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Zoomed in, the image can pan until its edge meets the edge of where it sits at fit; at fit it stays centred. */
export function clamp_camera(camera: Camera, width: number, height: number): Camera {
  const scale = clamp(camera.scale, 1, MAX_ZOOM);
  if (scale === 1) return FIT;
  const reach_x = (width * scale - width) / 2;
  const reach_y = (height * scale - height) / 2;
  return { scale, x: clamp(camera.x, -reach_x, reach_x), y: clamp(camera.y, -reach_y, reach_y) };
}

/** `at` is relative to the pane's centre; the image point under it stays put. */
export function zoom_at(camera: Camera, factor: number, at: Point): Camera {
  const scale = clamp(camera.scale * factor, 1, MAX_ZOOM);
  const k = scale / camera.scale;
  return { scale, x: at.x - (at.x - camera.x) * k, y: at.y - (at.y - camera.y) * k };
}

export function pinch(start: Camera, start_mid: Point, start_distance: number, mid: Point, distance: number): Camera {
  const scale = clamp(start.scale * (distance / Math.max(1, start_distance)), 1, MAX_ZOOM);
  const anchor = { x: (start_mid.x - start.x) / start.scale, y: (start_mid.y - start.y) / start.scale };
  return { scale, x: mid.x - anchor.x * scale, y: mid.y - anchor.y * scale };
}

export function fit_box(ratio: number, width: number, height: number): { width: number; height: number } {
  return width / height > ratio ? { width: height * ratio, height } : { width, height: width / ratio };
}
