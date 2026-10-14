export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** The image's layout size once rotated: a quarter turn swaps width and height. */
export function rotated_size(size: Size, rotation: number): Size {
  return rotation % 180 === 0 ? size : { width: size.height, height: size.width };
}

/** The scale that makes `content` fill `available` without overflowing; small images scale up. */
export function fit_scale(content: Size, available: Size): number {
  if (content.width <= 0 || content.height <= 0) return 1;
  return Math.max(0, Math.min(available.width / content.width, available.height / content.height));
}
