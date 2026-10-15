import { palette_rgba } from "./color";
import { cel_key, type Sprite } from "./model";

export interface CompositeOptions {
  overrides?: ReadonlyMap<string, Uint8Array>;
  hidden?: boolean;
}

export function composite(sprite: Sprite, frame_index: number, options: CompositeOptions = {}): Uint8ClampedArray<ArrayBuffer> {
  const { width, height } = sprite;
  const out = new Uint8ClampedArray(width * height * 4);
  const frame = sprite.frames[frame_index];
  if (!frame) return out;
  const table = palette_rgba(sprite.palette);

  for (const layer of sprite.layers) {
    if (!layer.visible && !options.hidden) continue;
    const key = cel_key(layer.id, frame.id);
    const data = options.overrides?.get(key) ?? sprite.cels.get(key);
    if (!data || layer.opacity <= 0) continue;
    const opacity = Math.min(1, layer.opacity);

    for (let i = 0; i < data.length; i++) {
      const index = data[i];
      if (!index) continue;
      const source = index * 4;
      const alpha = (table[source + 3] / 255) * opacity;
      if (alpha <= 0) continue;
      const target = i * 4;
      const below = out[target + 3] / 255;
      if (alpha >= 1 || below === 0) {
        out[target] = table[source];
        out[target + 1] = table[source + 1];
        out[target + 2] = table[source + 2];
        out[target + 3] = alpha * 255;
        continue;
      }
      const result = alpha + below * (1 - alpha);
      for (let c = 0; c < 3; c++) {
        out[target + c] = (table[source + c] * alpha + out[target + c] * below * (1 - alpha)) / result;
      }
      out[target + 3] = result * 255;
    }
  }
  return out;
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
