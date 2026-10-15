import type { Pixels } from "./flood-fill";
import type { Point, Rect } from "./shapes";

// A `resize` step holds the whole canvas at both sizes. A history's first entry and a stroke off the canvas hold none.
export interface Patch {
  x: number;
  y: number;
  before: ImageData | null;
  after: ImageData | null;
  resize: boolean;
}

export function empty_patch(): Patch {
  return { x: 0, y: 0, before: null, after: null, resize: false };
}

export function patch_bytes(patch: Patch): number {
  return (patch.before?.data.byteLength ?? 0) + (patch.after?.data.byteLength ?? 0);
}

export function union(a: Rect | null, b: Rect): Rect {
  if (!a) return b;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}

export function segment_bounds(from: Point, to: Point, margin: number): Rect {
  const x = Math.min(from.x, to.x) - margin;
  const y = Math.min(from.y, to.y) - margin;
  return { x, y, width: Math.abs(to.x - from.x) + 2 * margin, height: Math.abs(to.y - from.y) + 2 * margin };
}

export function clip_rect(rect: Rect, width: number, height: number): Rect | null {
  const left = Math.max(0, Math.floor(rect.x));
  const top = Math.max(0, Math.floor(rect.y));
  const right = Math.min(width, Math.ceil(rect.x + rect.width));
  const bottom = Math.min(height, Math.ceil(rect.y + rect.height));
  return right > left && bottom > top ? { x: left, y: top, width: right - left, height: bottom - top } : null;
}

export function copy_region(source: Pixels, rect: Rect): Uint8ClampedArray<ArrayBuffer> {
  const data = new Uint8ClampedArray(rect.width * rect.height * 4);
  const row = rect.width * 4;
  for (let y = 0; y < rect.height; y++) {
    const start = ((rect.y + y) * source.width + rect.x) * 4;
    data.set(source.data.subarray(start, start + row), y * row);
  }
  return data;
}

export function paste_region(target: Pixels, region: Pixels, x: number, y: number): void {
  const row = region.width * 4;
  for (let line = 0; line < region.height; line++) {
    target.data.set(region.data.subarray(line * row, line * row + row), ((y + line) * target.width + x) * 4);
  }
}

export function changed_bounds(a: Pixels, b: Pixels): Rect | null {
  const words_a = new Uint32Array(a.data.buffer, a.data.byteOffset, a.width * a.height);
  const words_b = new Uint32Array(b.data.buffer, b.data.byteOffset, b.width * b.height);
  let left = a.width;
  let top = a.height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < a.height; y++) {
    const row = y * a.width;
    for (let x = 0; x < a.width; x++) {
      if (words_a[row + x] === words_b[row + x]) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      bottom = y;
    }
  }
  return right < 0 ? null : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}
