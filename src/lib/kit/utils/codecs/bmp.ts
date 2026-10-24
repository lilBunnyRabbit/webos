import { concat_bytes, has_alpha, rgb_on_white } from "./pixels";
import type { Pixels } from "./ssim";

const BMP_HEADER = 54;
const V4_HEADER = 14 + 108;
export const BMP_MAX_BYTES = 0xffffffff;

const bmp_stride = (width: number) => Math.ceil((width * 3) / 4) * 4;
const ascii = (text: string) => Uint8Array.from(text, (char) => char.charCodeAt(0));

export function bmp_size(width: number, height: number): number {
  return BMP_HEADER + bmp_stride(width) * height;
}

/** A 24-bit top-down BMP, a band of rows at a time. `pad` puts a gap before the pixels so the file hits an exact size. */
export class BmpEncoder {
  private readonly stride: number;
  private rows = 0;

  constructor(
    private readonly width: number,
    private readonly height: number,
    private readonly pad = 0
  ) {
    this.stride = bmp_stride(width);
    if (bmp_size(width, height) + pad > BMP_MAX_BYTES) throw new Error("A BMP can't be larger than 4 GB");
  }

  header(): Uint8Array[] {
    const out = new Uint8Array(BMP_HEADER + this.pad);
    const view = new DataView(out.buffer);
    out.set(ascii("BM"), 0);
    view.setUint32(2, bmp_size(this.width, this.height) + this.pad, true);
    view.setUint32(10, BMP_HEADER + this.pad, true);
    view.setUint32(14, 40, true);
    view.setInt32(18, this.width, true);
    // Negative height: rows run top to bottom, the order they're rendered in.
    view.setInt32(22, -this.height, true);
    view.setUint16(26, 1, true);
    view.setUint16(28, 24, true);
    view.setUint32(34, this.stride * this.height, true);
    view.setInt32(38, 2835, true);
    view.setInt32(42, 2835, true);
    return [out];
  }

  push(rgb: Uint8Array): Uint8Array[] {
    const row_bytes = this.width * 3;
    const count = rgb.length / row_bytes;
    if (!Number.isInteger(count) || this.rows + count > this.height) throw new Error("Band doesn't match the image");
    const out = new Uint8Array(this.stride * count);
    for (let row = 0; row < count; row++) {
      let source = row * row_bytes;
      let target = row * this.stride;
      for (let x = 0; x < this.width; x++, source += 3, target += 3) {
        out[target] = rgb[source + 2];
        out[target + 1] = rgb[source + 1];
        out[target + 2] = rgb[source];
      }
    }
    this.rows += count;
    return [out];
  }

  finish(): Uint8Array[] {
    if (this.rows !== this.height) throw new Error(`${this.height - this.rows} rows missing`);
    return [];
  }
}

/**
 * 32-bit BGRA behind a BITMAPV4HEADER with an alpha mask: the plain 40-byte header has no alpha field, and readers
 * either drop the fourth byte or guess at it.
 */
function bmp_32(image: Pixels): Uint8Array<ArrayBuffer> {
  const { width, height, data } = image;
  const pixels = width * height * 4;
  if (V4_HEADER + pixels > BMP_MAX_BYTES) throw new Error("A BMP can't be larger than 4 GB");
  const out = new Uint8Array(V4_HEADER + pixels);
  const view = new DataView(out.buffer);
  out.set(ascii("BM"), 0);
  view.setUint32(2, out.length, true);
  view.setUint32(10, V4_HEADER, true);
  view.setUint32(14, 108, true);
  view.setInt32(18, width, true);
  view.setInt32(22, -height, true);
  view.setUint16(26, 1, true);
  view.setUint16(28, 32, true);
  view.setUint32(30, 3, true);
  view.setUint32(34, pixels, true);
  view.setInt32(38, 2835, true);
  view.setInt32(42, 2835, true);
  view.setUint32(54, 0x00ff0000, true);
  view.setUint32(58, 0x0000ff00, true);
  view.setUint32(62, 0x000000ff, true);
  view.setUint32(66, 0xff000000, true);
  out.set(ascii("BGRs"), 70);
  for (let source = 0, target = V4_HEADER; source < data.length; source += 4, target += 4) {
    out[target] = data[source + 2];
    out[target + 1] = data[source + 1];
    out[target + 2] = data[source];
    out[target + 3] = data[source + 3];
  }
  return out;
}

export function encode_bmp(image: Pixels): Uint8Array<ArrayBuffer> {
  if (has_alpha(image)) return bmp_32(image);
  const encoder = new BmpEncoder(image.width, image.height);
  return concat_bytes([...encoder.header(), ...encoder.push(rgb_on_white(image)), ...encoder.finish()]);
}
