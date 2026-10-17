import { crc32 } from "$lib/core/utils/zip/crc32";

const BMP_HEADER = 54;
export const BMP_MAX_BYTES = 0xffffffff;
const STORED_BLOCK = 65_535;
const IDAT_DATA = 1 << 20;
export const PNG_PAD_MIN = 12;

const bmp_stride = (width: number) => Math.ceil((width * 3) / 4) * 4;

export function bmp_size(width: number, height: number): number {
  return BMP_HEADER + bmp_stride(width) * height;
}

function zlib_size(width: number, height: number): number {
  const raw = height * (1 + width * 3);
  return 2 + raw + 5 * Math.ceil(raw / STORED_BLOCK) + 4;
}

export function png_stored_size(width: number, height: number): number {
  const zlib = zlib_size(width, height);
  return 8 + 25 + zlib + 12 * Math.ceil(zlib / IDAT_DATA) + 12;
}

export function adler32(data: Uint8Array, adler = 1): number {
  let a = adler & 0xffff;
  let b = adler >>> 16;
  let index = 0;
  while (index < data.length) {
    const end = Math.min(data.length, index + 5552);
    for (; index < end; index++) {
      a += data[index];
      b += a;
    }
    a %= 65521;
    b %= 65521;
  }
  return ((b << 16) | a) >>> 0;
}

const ascii = (text: string) => Uint8Array.from(text, (char) => char.charCodeAt(0));

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(ascii(type), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/**
 * Writes a PNG a band of rows at a time, without compressing: stored deflate blocks, filter 0 on every row. Memory
 * stays at one IDAT chunk however large the image. `pad` adds an ancillary chunk so the file hits an exact size.
 */
export class PngStoredEncoder {
  private readonly row_bytes: number;
  private raw_left: number;
  private block_left = 0;
  private adler = 1;
  private buffer = new Uint8Array(12 + IDAT_DATA);
  private used = 0;
  private rows = 0;

  constructor(
    private readonly width: number,
    private readonly height: number,
    private readonly pad = 0
  ) {
    if (pad !== 0 && pad < PNG_PAD_MIN) throw new Error(`PNG padding must be 0 or at least ${PNG_PAD_MIN} bytes`);
    this.row_bytes = width * 3;
    this.raw_left = height * (1 + this.row_bytes);
  }

  header(): Uint8Array[] {
    const ihdr = new Uint8Array(13);
    const view = new DataView(ihdr.buffer);
    view.setUint32(0, this.width);
    view.setUint32(4, this.height);
    ihdr.set([8, 2, 0, 0, 0], 8);
    const parts = [Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10), chunk("IHDR", ihdr)];
    // Ancillary, private, safe to copy: decoders skip it.
    if (this.pad) parts.push(chunk("paDd", new Uint8Array(this.pad - PNG_PAD_MIN)));
    return [...parts, ...this.write(Uint8Array.of(0x78, 0x01))];
  }

  push(rgb: Uint8Array): Uint8Array[] {
    const count = rgb.length / this.row_bytes;
    if (!Number.isInteger(count) || this.rows + count > this.height) throw new Error("Band doesn't match the image");
    const out: Uint8Array[] = [];
    const filter = Uint8Array.of(0);
    for (let row = 0; row < count; row++) {
      out.push(...this.deflate(filter));
      out.push(...this.deflate(rgb.subarray(row * this.row_bytes, (row + 1) * this.row_bytes)));
    }
    this.rows += count;
    return out;
  }

  finish(): Uint8Array[] {
    if (this.rows !== this.height) throw new Error(`${this.height - this.rows} rows missing`);
    const tail = new Uint8Array(4);
    new DataView(tail.buffer).setUint32(0, this.adler);
    const out = this.write(tail);
    if (this.used) out.push(this.flush());
    out.push(chunk("IEND", new Uint8Array(0)));
    return out;
  }

  private deflate(raw: Uint8Array): Uint8Array[] {
    const out: Uint8Array[] = [];
    this.adler = adler32(raw, this.adler);
    let offset = 0;
    while (offset < raw.length) {
      if (this.block_left === 0) {
        const length = Math.min(STORED_BLOCK, this.raw_left);
        const final = length === this.raw_left ? 1 : 0;
        out.push(...this.write(Uint8Array.of(final, length & 255, length >>> 8, ~length & 255, (~length >>> 8) & 255)));
        this.block_left = length;
      }
      const take = Math.min(this.block_left, raw.length - offset);
      out.push(...this.write(raw.subarray(offset, offset + take)));
      offset += take;
      this.block_left -= take;
      this.raw_left -= take;
    }
    return out;
  }

  private write(data: Uint8Array): Uint8Array[] {
    const out: Uint8Array[] = [];
    let offset = 0;
    while (offset < data.length) {
      const take = Math.min(IDAT_DATA - this.used, data.length - offset);
      this.buffer.set(data.subarray(offset, offset + take), 8 + this.used);
      this.used += take;
      offset += take;
      if (this.used === IDAT_DATA) out.push(this.flush());
    }
    return out;
  }

  private flush(): Uint8Array {
    const out = this.buffer.subarray(0, 12 + this.used);
    const view = new DataView(out.buffer, out.byteOffset);
    view.setUint32(0, this.used);
    out.set(ascii("IDAT"), 4);
    view.setUint32(8 + this.used, crc32(out.subarray(4, 8 + this.used)));
    this.buffer = new Uint8Array(12 + IDAT_DATA);
    this.used = 0;
    return out;
  }
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

export type StreamEncoder = PngStoredEncoder | BmpEncoder;
