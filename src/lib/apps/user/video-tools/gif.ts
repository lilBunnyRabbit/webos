import { color_table_bits, lzw_encode } from "$lib/apps/user/hopsprite/gif";

export { gif_delays, GIF_TRAILER } from "$lib/apps/user/hopsprite/gif";

const u16 = (value: number) => [value & 0xff, (value >> 8) & 0xff];
const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0));

/** Header without a global colour table: every video frame carries its own palette. */
export function gif_start(width: number, height: number): Uint8Array<ArrayBuffer> {
  return new Uint8Array([
    ...ascii("GIF89a"),
    ...u16(width),
    ...u16(height),
    0,
    0,
    0,
    ...[0x21, 0xff, 0x0b, ...ascii("NETSCAPE2.0"), 0x03, 0x01, 0x00, 0x00, 0x00],
  ]);
}

export interface LocalFrame {
  width: number;
  height: number;
  palette: Uint8Array;
  indices: Uint8Array;
  delay: number;
}

export function gif_local_frame({ width, height, palette, indices, delay }: LocalFrame): Uint8Array<ArrayBuffer> {
  const colors = Math.max(2, palette.length / 3);
  const bits = color_table_bits(colors);
  const table = new Uint8Array(3 << bits);
  table.set(palette.subarray(0, Math.min(palette.length, table.length)));
  const head = new Uint8Array([
    0x21,
    0xf9,
    0x04,
    1 << 2,
    ...u16(delay),
    0,
    0,
    0x2c,
    ...u16(0),
    ...u16(0),
    ...u16(width),
    ...u16(height),
    0x80 | (bits - 1),
  ]);
  const data = lzw_encode(indices, Math.max(2, bits));
  const out = new Uint8Array(head.length + table.length + data.length);
  out.set(head);
  out.set(table, head.length);
  out.set(data, head.length + table.length);
  return out;
}
