import { parse_hex } from "./color";

const MAX_CODES = 4096;

export function color_table_bits(colors: number): number {
  let bits = 1;
  while (1 << bits < colors) bits++;
  return bits;
}

class ByteWriter {
  private buffer = new Uint8Array(1024);
  length = 0;

  byte(value: number): void {
    if (this.length === this.buffer.length) {
      const grown = new Uint8Array(this.buffer.length * 2);
      grown.set(this.buffer);
      this.buffer = grown;
    }
    this.buffer[this.length++] = value;
  }

  u16(value: number): void {
    this.byte(value & 0xff);
    this.byte((value >> 8) & 0xff);
  }

  bytes(values: ArrayLike<number>): void {
    for (let i = 0; i < values.length; i++) this.byte(values[i]);
  }

  ascii(text: string): void {
    for (let i = 0; i < text.length; i++) this.byte(text.charCodeAt(i));
  }

  result(): Uint8Array<ArrayBuffer> {
    return this.buffer.slice(0, this.length);
  }
}

/** GIF LZW with variable code sizes, packed into the 255-byte sub-blocks of an image data block. */
export function lzw_encode(indices: Uint8Array, min_code_size: number): Uint8Array<ArrayBuffer> {
  const out = new ByteWriter();
  const block = new Uint8Array(255);
  let filled = 0;
  let bits = 0;
  let pending = 0;

  const push_byte = (value: number) => {
    block[filled++] = value;
    if (filled === 255) {
      out.byte(255);
      out.bytes(block);
      filled = 0;
    }
  };
  const emit = (code: number, size: number) => {
    pending |= code << bits;
    bits += size;
    while (bits >= 8) {
      push_byte(pending & 0xff);
      pending >>>= 8;
      bits -= 8;
    }
  };

  const clear = 1 << min_code_size;
  const end = clear + 1;
  let size = min_code_size + 1;
  let next = end + 1;
  const table = new Map<number, number>();

  out.byte(min_code_size);
  emit(clear, size);
  if (indices.length) {
    let prefix = indices[0];
    for (let i = 1; i < indices.length; i++) {
      const value = indices[i];
      const key = (prefix << 8) | value;
      const known = table.get(key);
      if (known !== undefined) {
        prefix = known;
        continue;
      }
      emit(prefix, size);
      // Codes grow one entry behind the decoder, which only learns a code after reading the next one.
      if (next === MAX_CODES) {
        emit(clear, size);
        table.clear();
        size = min_code_size + 1;
        next = end + 1;
      } else {
        if (next >= 1 << size) size++;
        table.set(key, next++);
      }
      prefix = value;
    }
    emit(prefix, size);
  }
  emit(end, size);
  if (bits > 0) push_byte(pending & 0xff);
  if (filled) {
    out.byte(filled);
    out.bytes(block.subarray(0, filled));
  }
  out.byte(0);
  return out.result();
}

export interface GifFrame {
  indices: Uint8Array;
  /** Centiseconds, the unit GIF stores. */
  delay: number;
}

export interface GifHeader {
  width: number;
  height: number;
  /** `#rrggbb[aa]` entries; alpha is ignored, `transparent` marks the see-through one. */
  palette: readonly string[];
  transparent: number | null;
  loop: boolean;
}

export function gif_header({ width, height, palette, loop }: GifHeader): Uint8Array<ArrayBuffer> {
  const out = new ByteWriter();
  const table_bits = color_table_bits(Math.max(2, palette.length));
  out.ascii("GIF89a");
  out.u16(width);
  out.u16(height);
  out.byte(0x80 | ((table_bits - 1) << 4) | (table_bits - 1));
  out.byte(0);
  out.byte(0);
  for (let i = 0; i < 1 << table_bits; i++) {
    const [r, g, b] = i < palette.length ? parse_hex(palette[i]) : [0, 0, 0];
    out.bytes([r, g, b]);
  }
  if (loop) {
    out.bytes([0x21, 0xff, 0x0b]);
    out.ascii("NETSCAPE2.0");
    out.bytes([0x03, 0x01, 0x00, 0x00, 0x00]);
  }
  return out.result();
}

/** One full-canvas frame. Disposal 2 clears it before the next, so transparent pixels never show the previous frame. */
export function gif_frame(header: GifHeader, frame: GifFrame): Uint8Array<ArrayBuffer> {
  const out = new ByteWriter();
  const transparent = header.transparent !== null;
  out.bytes([0x21, 0xf9, 0x04, (2 << 2) | (transparent ? 1 : 0)]);
  out.u16(frame.delay);
  out.byte(transparent ? header.transparent! : 0);
  out.byte(0);
  out.byte(0x2c);
  out.u16(0);
  out.u16(0);
  out.u16(header.width);
  out.u16(header.height);
  out.byte(0);
  const head = out.result();
  const data = lzw_encode(frame.indices, Math.max(2, color_table_bits(Math.max(2, header.palette.length))));
  const joined = new Uint8Array(head.length + data.length);
  joined.set(head);
  joined.set(data, head.length);
  return joined;
}

export const GIF_TRAILER = new Uint8Array([0x3b]);

export function encode_gif(header: GifHeader, frames: readonly GifFrame[]): Blob {
  return new Blob([gif_header(header), ...frames.map((frame) => gif_frame(header, frame)), GIF_TRAILER], { type: "image/gif" });
}

/**
 * Milliseconds to centiseconds on a running total, so rounding never drifts the loop's length. Browsers play 0–1 cs
 * as 10 cs, so the shortest delay written is 2.
 */
export function gif_delays(durations: readonly number[]): number[] {
  let elapsed = 0;
  let written = 0;
  return durations.map((duration) => {
    elapsed += duration;
    const delay = Math.max(2, Math.round(elapsed / 10) - written);
    written += delay;
    return delay;
  });
}

export function scale_indices(indices: Uint8Array, width: number, height: number, scale: number): Uint8Array {
  if (scale === 1) return indices;
  const out = new Uint8Array(width * scale * height * scale);
  const row = new Uint8Array(width * scale);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) row.fill(indices[y * width + x], x * scale, (x + 1) * scale);
    for (let copy = 0; copy < scale; copy++) out.set(row, (y * scale + copy) * row.length);
  }
  return out;
}
