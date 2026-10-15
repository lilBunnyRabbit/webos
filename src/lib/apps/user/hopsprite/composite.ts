import { palette_rgba } from "./color";
import { cel_key, type Rect, type Sprite } from "./model";

export interface CompositeOptions {
  overrides?: ReadonlyMap<string, Uint8Array>;
  hidden?: boolean;
}

interface Source {
  data: Uint8Array;
  opacity: number;
}

function sources(sprite: Sprite, frame_index: number, options: CompositeOptions): Source[] {
  const frame = sprite.frames[frame_index];
  if (!frame) return [];
  const result: Source[] = [];
  for (const layer of sprite.layers) {
    if (!layer.visible && !options.hidden) continue;
    const key = cel_key(layer.id, frame.id);
    const data = options.overrides?.get(key) ?? sprite.cels.get(key);
    if (data && layer.opacity > 0) result.push({ data, opacity: Math.min(1, layer.opacity) });
  }
  return result;
}

function blend(out: Uint8ClampedArray, target: number, table: Uint8ClampedArray, index: number, opacity: number): void {
  const source = index * 4;
  const alpha = (table[source + 3] / 255) * opacity;
  if (alpha <= 0) return;
  const below = out[target + 3] / 255;
  if (alpha >= 1 || below === 0) {
    out[target] = table[source];
    out[target + 1] = table[source + 1];
    out[target + 2] = table[source + 2];
    out[target + 3] = alpha * 255;
    return;
  }
  const result = alpha + below * (1 - alpha);
  for (let c = 0; c < 3; c++) out[target + c] = (table[source + c] * alpha + out[target + c] * below * (1 - alpha)) / result;
  out[target + 3] = result * 255;
}

export function composite(sprite: Sprite, frame_index: number, options: CompositeOptions = {}): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(sprite.width * sprite.height * 4);
  composite_into(out, sprite, frame_index, { x: 0, y: 0, width: sprite.width, height: sprite.height }, options);
  return out;
}

/** Recomposites only `rect` of a full-size RGBA buffer, so a stroke repaints the pixels it touched. */
export function composite_into(out: Uint8ClampedArray, sprite: Sprite, frame_index: number, rect: Rect, options: CompositeOptions = {}): void {
  const { width } = sprite;
  const x0 = Math.max(0, rect.x);
  const y0 = Math.max(0, rect.y);
  const x1 = Math.min(width, rect.x + rect.width);
  const y1 = Math.min(sprite.height, rect.y + rect.height);
  if (x1 <= x0 || y1 <= y0) return;
  for (let y = y0; y < y1; y++) out.fill(0, (y * width + x0) * 4, (y * width + x1) * 4);
  const table = palette_rgba(sprite.palette);
  for (const { data, opacity } of sources(sprite, frame_index, options)) {
    for (let y = y0; y < y1; y++) {
      for (let i = y * width + x0, end = y * width + x1; i < end; i++) {
        const index = data[i];
        if (index) blend(out, i * 4, table, index, opacity);
      }
    }
  }
}

/** Nearest-neighbour composite at thumbnail size: costs the thumbnail's pixels, not the sprite's. */
export function composite_sampled(sprite: Sprite, frame_index: number, out_width: number, out_height: number): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(out_width * out_height * 4);
  const table = palette_rgba(sprite.palette);
  const columns = Int32Array.from({ length: out_width }, (_, x) => Math.min(sprite.width - 1, Math.floor(((x + 0.5) * sprite.width) / out_width)));
  for (const { data, opacity } of sources(sprite, frame_index, {})) {
    for (let y = 0; y < out_height; y++) {
      const row = Math.min(sprite.height - 1, Math.floor(((y + 0.5) * sprite.height) / out_height)) * sprite.width;
      for (let x = 0; x < out_width; x++) {
        const index = data[row + columns[x]];
        if (index) blend(out, (y * out_width + x) * 4, table, index, opacity);
      }
    }
  }
  return out;
}

/** Everything a frame's composite depends on, compared by identity: equal inputs mean equal pixels. */
export function frame_inputs(sprite: Sprite, frame_index: number, overrides?: ReadonlyMap<string, Uint8Array>): unknown[] {
  const id = sprite.frames[frame_index]?.id ?? "";
  const result: unknown[] = [sprite.palette, sprite.width, sprite.height, id];
  for (const layer of sprite.layers) {
    const key = cel_key(layer.id, id);
    result.push(layer.visible, layer.opacity, overrides?.get(key) ?? sprite.cels.get(key));
  }
  return result;
}

export function same_inputs(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}

export function pick_index(sprite: Sprite, frame_index: number, x: number, y: number): number {
  const frame = sprite.frames[frame_index];
  if (!frame || x < 0 || y < 0 || x >= sprite.width || y >= sprite.height) return 0;
  for (let l = sprite.layers.length - 1; l >= 0; l--) {
    const layer = sprite.layers[l];
    if (!layer.visible) continue;
    const index = sprite.cels.get(cel_key(layer.id, frame.id))?.[y * sprite.width + x];
    if (index) return index;
  }
  return 0;
}
