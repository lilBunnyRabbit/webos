export interface Size {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

// Big photos are read once into memory for sampling; past this a 48-megapixel shot would hold about 190 MB.
export const MAX_SAMPLE_SIDE = 2048;

export function fit_size({ width, height }: Size, max = MAX_SAMPLE_SIDE): Size {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function pixel_at(point: Point, box: Size, picture: Size): Point {
  const x = Math.floor((point.x / box.width) * picture.width);
  const y = Math.floor((point.y / box.height) * picture.height);
  return clamp_point({ x, y }, picture);
}

export function clamp_point({ x, y }: Point, { width, height }: Size): Point {
  return { x: Math.min(width - 1, Math.max(0, Math.round(x))), y: Math.min(height - 1, Math.max(0, Math.round(y))) };
}

export function read_rgba(data: Uint8ClampedArray, width: number, { x, y }: Point): Rgba {
  const at = (y * width + x) * 4;
  return { r: data[at], g: data[at + 1], b: data[at + 2], a: data[at + 3] };
}
