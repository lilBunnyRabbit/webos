export type Rgba = readonly [number, number, number, number];

const HEX = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i;

export function is_hex(value: string): boolean {
  return HEX.test(value.trim());
}

export function parse_hex(hex: string): Rgba {
  const match = HEX.exec(hex.trim());
  if (!match) return [0, 0, 0, 255];
  const value = parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255, match[2] ? parseInt(match[2], 16) : 255];
}

function channel(value: number): string {
  return Math.round(Math.min(255, Math.max(0, value))).toString(16).padStart(2, "0");
}

export function to_hex([r, g, b, a]: Rgba): string {
  return `#${channel(r)}${channel(g)}${channel(b)}${channel(a)}`;
}

export function normalize_hex(hex: string): string {
  return to_hex(parse_hex(hex));
}

export function rgb_hex(hex: string): string {
  return normalize_hex(hex).slice(0, 7);
}

export function alpha_of(hex: string): number {
  return parse_hex(hex)[3];
}

export function with_alpha(hex: string, alpha: number): string {
  const [r, g, b] = parse_hex(hex);
  return to_hex([r, g, b, alpha]);
}

const tables = new WeakMap<readonly string[], Uint8ClampedArray>();

export function palette_rgba(palette: readonly string[]): Uint8ClampedArray {
  let table = tables.get(palette);
  if (!table) {
    table = new Uint8ClampedArray(256 * 4);
    palette.forEach((hex, index) => table!.set(parse_hex(hex), index * 4));
    table.set([0, 0, 0, 0], 0);
    tables.set(palette, table);
  }
  return table;
}

export function color_distance(a: Rgba, b: Rgba): number {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  const da = a[3] - b[3];
  return 0.3 * dr * dr + 0.59 * dg * dg + 0.11 * db * db + da * da;
}

// Never index 0: transparency is decided by alpha before matching.
export function nearest_index(palette: readonly string[], color: Rgba): number {
  let best = 1;
  let best_distance = Infinity;
  for (let index = 1; index < palette.length; index++) {
    const distance = color_distance(parse_hex(palette[index]), color);
    if (distance < best_distance) {
      best = index;
      best_distance = distance;
    }
  }
  return palette.length > 1 ? best : 0;
}
