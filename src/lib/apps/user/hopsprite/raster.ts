import type { Point, Rect } from "./model";

export const BrushShape = { SQUARE: "square", ROUND: "round" } as const;
export type BrushShape = (typeof BrushShape)[keyof typeof BrushShape];

export const Pattern = { SOLID: "solid", DENSE: "dense", CHECKER: "checker", SPARSE: "sparse" } as const;
export type Pattern = (typeof Pattern)[keyof typeof Pattern];
export const PATTERNS = Object.values(Pattern) as [Pattern, ...Pattern[]];

export function line_points(a: Point, b: Point): Point[] {
  let x = Math.round(a.x);
  let y = Math.round(a.y);
  const end_x = Math.round(b.x);
  const end_y = Math.round(b.y);
  const dx = Math.abs(end_x - x);
  const dy = -Math.abs(end_y - y);
  const step_x = x < end_x ? 1 : -1;
  const step_y = y < end_y ? 1 : -1;
  let error = dx + dy;
  const points: Point[] = [];
  for (;;) {
    points.push({ x, y });
    if (x === end_x && y === end_y) return points;
    const double = 2 * error;
    if (double >= dy) {
      error += dy;
      x += step_x;
    }
    if (double <= dx) {
      error += dx;
      y += step_y;
    }
  }
}

export function pixel_perfect(points: readonly Point[]): Point[] {
  const result: Point[] = [];
  for (const point of points) {
    const last = result[result.length - 1];
    if (last && last.x === point.x && last.y === point.y) continue;
    if (result.length >= 2) {
      const a = result[result.length - 2];
      const b = last!;
      const corner = (a.x === b.x || a.y === b.y) && (b.x === point.x || b.y === point.y);
      if (corner && a.x !== point.x && a.y !== point.y) result.pop();
    }
    result.push(point);
  }
  return result;
}

export function brush_offsets(size: number, shape: BrushShape): Point[] {
  const start = -Math.floor((size - 1) / 2);
  const center = (size - 1) / 2;
  // The 0.5 trim turns a 3px round brush into a plus instead of a square.
  const radius = size >= 3 ? (size / 2) ** 2 - 0.5 : Infinity;
  const offsets: Point[] = [];
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      if (shape === BrushShape.ROUND && (i - center) ** 2 + (j - center) ** 2 > radius) continue;
      offsets.push({ x: start + i, y: start + j });
    }
  }
  return offsets;
}

export function pattern_hit(pattern: Pattern, x: number, y: number): boolean {
  if (pattern === Pattern.SOLID) return true;
  const bayer = [0, 2, 3, 1][(y & 1) * 2 + (x & 1)];
  if (pattern === Pattern.SPARSE) return bayer < 1;
  if (pattern === Pattern.CHECKER) return bayer < 2;
  return bayer < 3;
}

export function mirror_points(point: Point, width: number, height: number, mirror_x: boolean, mirror_y: boolean): Point[] {
  const points = [point];
  if (mirror_x) points.push({ x: width - 1 - point.x, y: point.y });
  if (mirror_y) points.push({ x: point.x, y: height - 1 - point.y });
  if (mirror_x && mirror_y) points.push({ x: width - 1 - point.x, y: height - 1 - point.y });
  return points;
}

export function normalize_rect(a: Point, b: Point, square = false): Rect {
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  if (square) {
    const side = Math.max(Math.abs(dx), Math.abs(dy));
    dx = Math.sign(dx || 1) * side;
    dy = Math.sign(dy || 1) * side;
  }
  return { x: Math.min(a.x, a.x + dx), y: Math.min(a.y, a.y + dy), width: Math.abs(dx) + 1, height: Math.abs(dy) + 1 };
}

export function snap_line(a: Point, b: Point): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
  const length = Math.max(Math.abs(dx), Math.abs(dy));
  const diagonal = Math.abs(Math.cos(angle)) > 0.1 && Math.abs(Math.sin(angle)) > 0.1;
  return {
    x: a.x + Math.round(diagonal ? Math.sign(Math.cos(angle)) * length : Math.cos(angle) * length),
    y: a.y + Math.round(diagonal ? Math.sign(Math.sin(angle)) * length : Math.sin(angle) * length),
  };
}

export function rect_points(rect: Rect, filled: boolean): Point[] {
  const points: Point[] = [];
  const right = rect.x + rect.width - 1;
  const bottom = rect.y + rect.height - 1;
  for (let y = rect.y; y <= bottom; y++) {
    for (let x = rect.x; x <= right; x++) {
      if (filled || y === rect.y || y === bottom || x === rect.x || x === right) points.push({ x, y });
    }
  }
  return points;
}

/** Zingl's midpoint ellipse inside a pixel rectangle, so every size from 1×1 up comes out symmetric. */
export function ellipse_points(rect: Rect, filled: boolean): Point[] {
  const outline: Point[] = [];
  let x0 = rect.x;
  let x1 = rect.x + rect.width - 1;
  let y0 = rect.y;
  let y1 = rect.y + rect.height - 1;
  let a = Math.abs(x1 - x0);
  const b = Math.abs(y1 - y0);
  let b1 = b & 1;
  let dx = 4 * (1 - a) * b * b;
  let dy = 4 * (b1 + 1) * a * a;
  let err = dx + dy + b1 * a * a;
  y0 += (b + 1) >> 1;
  y1 = y0 - b1;
  a = 8 * a * a;
  b1 = 8 * b * b;
  do {
    outline.push({ x: x1, y: y0 }, { x: x0, y: y0 }, { x: x0, y: y1 }, { x: x1, y: y1 });
    const e2 = 2 * err;
    if (e2 <= dy) {
      y0++;
      y1--;
      err += dy += a;
    }
    if (e2 >= dx || 2 * err > dy) {
      x0++;
      x1--;
      err += dx += b1;
    }
  } while (x0 <= x1);
  while (y0 - y1 <= b) {
    outline.push({ x: x0 - 1, y: y0 }, { x: x1 + 1, y: y0++ }, { x: x0 - 1, y: y1 }, { x: x1 + 1, y: y1-- });
  }

  const unique = new Map<number, Point>();
  for (const point of outline) unique.set(point.y * 65536 + point.x, point);
  if (!filled) return [...unique.values()];

  const rows = new Map<number, { min: number; max: number }>();
  for (const { x, y } of unique.values()) {
    const row = rows.get(y);
    if (!row) rows.set(y, { min: x, max: x });
    else {
      row.min = Math.min(row.min, x);
      row.max = Math.max(row.max, x);
    }
  }
  const points: Point[] = [];
  for (const [y, { min, max }] of rows) for (let x = min; x <= max; x++) points.push({ x, y });
  return points;
}

export function match_mask(
  data: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  contiguous: boolean
): Uint8Array | null {
  if (x < 0 || y < 0 || x >= width || y >= height) return null;
  const target = data[y * width + x];
  const mask = new Uint8Array(width * height);
  if (!contiguous) {
    for (let i = 0; i < data.length; i++) if (data[i] === target) mask[i] = 1;
    return mask;
  }
  const matches = (index: number) => !mask[index] && data[index] === target;
  const stack: number[] = [x, y];
  while (stack.length) {
    const seed_y = stack.pop()!;
    const seed_x = stack.pop()!;
    const row = seed_y * width;
    if (!matches(row + seed_x)) continue;
    let left = seed_x;
    while (left > 0 && matches(row + left - 1)) left--;
    let right = seed_x;
    while (right < width - 1 && matches(row + right + 1)) right++;
    for (let column = left; column <= right; column++) mask[row + column] = 1;
    for (const next_y of [seed_y - 1, seed_y + 1]) {
      if (next_y < 0 || next_y >= height) continue;
      const next_row = next_y * width;
      let in_run = false;
      for (let column = left; column <= right; column++) {
        const open = matches(next_row + column);
        if (open && !in_run) stack.push(column, next_y);
        in_run = open;
      }
    }
  }
  return mask;
}

export function mask_bounds(mask: Uint8Array, width: number, height: number): Rect | null {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (!mask[row + x]) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      bottom = y;
    }
  }
  return right < 0 ? null : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

export function rect_mask(rect: Rect, width: number, height: number): Uint8Array {
  const mask = new Uint8Array(width * height);
  const x0 = Math.max(0, rect.x);
  const x1 = Math.min(width, rect.x + rect.width);
  for (let y = Math.max(0, rect.y); y < Math.min(height, rect.y + rect.height); y++) mask.fill(1, y * width + x0, y * width + x1);
  return mask;
}

export function extract(data: Uint8Array, width: number, rect: Rect, mask?: Uint8Array): Uint8Array {
  const out = new Uint8Array(rect.width * rect.height);
  for (let y = 0; y < rect.height; y++) {
    for (let x = 0; x < rect.width; x++) {
      const source = (rect.y + y) * width + rect.x + x;
      if (!mask || mask[source]) out[y * rect.width + x] = data[source];
    }
  }
  return out;
}

export function stamp(
  target: Uint8Array,
  width: number,
  height: number,
  source: Uint8Array,
  source_width: number,
  source_height: number,
  x: number,
  y: number
): void {
  for (let j = 0; j < source_height; j++) {
    const ty = y + j;
    if (ty < 0 || ty >= height) continue;
    for (let i = 0; i < source_width; i++) {
      const tx = x + i;
      const index = source[j * source_width + i];
      if (tx < 0 || tx >= width || !index) continue;
      target[ty * width + tx] = index;
    }
  }
}

export function shift_mask(mask: Uint8Array, width: number, height: number, dx: number, dy: number): Uint8Array {
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const ty = y + dy;
    if (ty < 0 || ty >= height) continue;
    for (let x = 0; x < width; x++) {
      const tx = x + dx;
      if (mask[y * width + x] && tx >= 0 && tx < width) out[ty * width + tx] = 1;
    }
  }
  return out;
}

export function flip_horizontal(data: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(data.length);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) out[y * width + x] = data[y * width + width - 1 - x];
  return out;
}

export function flip_vertical(data: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(data.length);
  for (let y = 0; y < height; y++) out.set(data.subarray((height - 1 - y) * width, (height - y) * width), y * width);
  return out;
}

export function rotate_cw(data: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(data.length);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) out[x * height + (height - 1 - y)] = data[y * width + x];
  return out;
}

export function rotate_ccw(data: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(data.length);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) out[(width - 1 - x) * height + y] = data[y * width + x];
  return out;
}

export function resize_canvas(
  data: Uint8Array,
  width: number,
  height: number,
  next_width: number,
  next_height: number,
  dx: number,
  dy: number
): Uint8Array {
  const out = new Uint8Array(next_width * next_height);
  stamp(out, next_width, next_height, data, width, height, dx, dy);
  return out;
}

export function scale_nearest(data: Uint8Array, width: number, height: number, next_width: number, next_height: number): Uint8Array {
  const out = new Uint8Array(next_width * next_height);
  for (let y = 0; y < next_height; y++) {
    const source_y = Math.min(height - 1, Math.floor((y * height) / next_height));
    for (let x = 0; x < next_width; x++) {
      out[y * next_width + x] = data[source_y * width + Math.min(width - 1, Math.floor((x * width) / next_width))];
    }
  }
  return out;
}

export function remap(data: Uint8Array, table: ArrayLike<number>): Uint8Array {
  const out = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) out[i] = table[data[i]];
  return out;
}

export function is_empty(data: Uint8Array): boolean {
  for (let i = 0; i < data.length; i++) if (data[i]) return false;
  return true;
}

export function content_bounds(data: Uint8Array, width: number, height: number): Rect | null {
  return mask_bounds(data, width, height);
}

// Merged into runs so a big selection outlines with a few long segments, not one per pixel.
export function mask_edges(mask: Uint8Array, width: number, height: number): number[] {
  const segments: number[] = [];
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < width && y < height ? mask[y * width + x] : 0);
  for (let y = 0; y <= height; y++) {
    let start = -1;
    for (let x = 0; x <= width; x++) {
      const edge = x < width && at(x, y - 1) !== at(x, y);
      if (edge && start < 0) start = x;
      if (!edge && start >= 0) {
        segments.push(start, y, x, y);
        start = -1;
      }
    }
  }
  for (let x = 0; x <= width; x++) {
    let start = -1;
    for (let y = 0; y <= height; y++) {
      const edge = y < height && at(x - 1, y) !== at(x, y);
      if (edge && start < 0) start = y;
      if (!edge && start >= 0) {
        segments.push(x, start, x, y);
        start = -1;
      }
    }
  }
  return segments;
}
