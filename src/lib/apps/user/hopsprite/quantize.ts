import { nearest_index, to_hex } from "./color";
import { MAX_COLORS } from "./model";

export interface Indexed {
  data: Uint8Array;
  palette: string[];
  approximated: number;
}

// Below half alpha is a hole: indexed art has one transparent entry and no partial coverage at the edges.
const ALPHA_CUTOFF = 128;

export function index_pixels(rgba: Uint8ClampedArray, palette: readonly string[]): Indexed {
  const next = [...palette];
  const lookup = new Map<number, number>();
  next.forEach((hex, index) => {
    if (index > 0) lookup.set(parseInt(hex.slice(1), 16) >>> 0, index);
  });
  const missed = new Set<number>();
  const data = new Uint8Array(rgba.length / 4);

  for (let i = 0; i < data.length; i++) {
    const offset = i * 4;
    const a = rgba[offset + 3];
    if (a < ALPHA_CUTOFF) continue;
    const color = [rgba[offset], rgba[offset + 1], rgba[offset + 2], 255] as const;
    const key = ((color[0] << 24) | (color[1] << 16) | (color[2] << 8) | 255) >>> 0;
    let index = lookup.get(key);
    if (index === undefined) {
      if (next.length < MAX_COLORS) {
        index = next.length;
        next.push(to_hex(color));
      } else {
        index = nearest_index(next, color);
        missed.add(key);
      }
      lookup.set(key, index);
    }
    data[i] = index;
  }
  return { data, palette: next, approximated: missed.size };
}
