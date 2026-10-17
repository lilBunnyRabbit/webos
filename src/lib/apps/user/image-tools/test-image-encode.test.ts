import { describe, expect, test } from "vitest";
import { crc32 } from "$lib/core/utils/zip/crc32";
import { adler32, bmp_size, BmpEncoder, png_stored_size, PngStoredEncoder } from "./test-image-encode";

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function pixel_at(x: number, y: number): [number, number, number] {
  return [(x * 7 + y) & 255, (y * 13) & 255, (x ^ y) & 255];
}

function band(width: number, from: number, rows: number): Uint8Array {
  const out = new Uint8Array(width * rows * 3);
  for (let j = 0; j < rows; j++) for (let x = 0; x < width; x++) out.set(pixel_at(x, from + j), (j * width + x) * 3);
  return out;
}

function encode(encoder: PngStoredEncoder | BmpEncoder, width: number, height: number, band_rows: number): Uint8Array {
  const parts = [...encoder.header()];
  for (let y = 0; y < height; y += band_rows) parts.push(...encoder.push(band(width, y, Math.min(band_rows, height - y))));
  parts.push(...encoder.finish());
  return concat(parts);
}

interface Chunk {
  type: string;
  data: Uint8Array;
}

function read_chunks(png: Uint8Array): Chunk[] {
  expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const chunks: Chunk[] = [];
  let offset = 8;
  while (offset < png.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...png.subarray(offset + 4, offset + 8));
    const data = png.subarray(offset + 8, offset + 8 + length);
    expect(view.getUint32(offset + 8 + length), `${type} CRC`).toBe(crc32(png.subarray(offset + 4, offset + 8 + length)));
    chunks.push({ type, data });
    offset += 12 + length;
  }
  return chunks;
}

// The platform's own zlib, not ours: it also checks the Adler-32 at the end.
async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function decode_png(png: Uint8Array): Promise<{ width: number; height: number; rgb: Uint8Array; chunks: Chunk[] }> {
  const chunks = read_chunks(png);
  expect(chunks[0].type).toBe("IHDR");
  expect(chunks.at(-1)!.type).toBe("IEND");
  const header = new DataView(chunks[0].data.buffer, chunks[0].data.byteOffset);
  const width = header.getUint32(0);
  const height = header.getUint32(4);
  expect([...chunks[0].data.subarray(8)]).toEqual([8, 2, 0, 0, 0]);
  const raw = await inflate(concat(chunks.filter((chunk) => chunk.type === "IDAT").map((chunk) => chunk.data)));
  expect(raw.length).toBe(height * (1 + width * 3));
  const rgb = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    expect(raw[y * (1 + width * 3)]).toBe(0);
    rgb.set(raw.subarray(y * (1 + width * 3) + 1, (y + 1) * (1 + width * 3)), y * width * 3);
  }
  return { width, height, rgb, chunks };
}

describe("adler32", () => {
  test("matches the known value and continues across calls", () => {
    const text = Uint8Array.from("Wikipedia", (char) => char.charCodeAt(0));
    expect(adler32(text)).toBe(0x11e60398);
    expect(adler32(text.subarray(4), adler32(text.subarray(0, 4)))).toBe(0x11e60398);
  });
});

describe("PngStoredEncoder", () => {
  test("decodes back to the same pixels, whatever the band height", async () => {
    for (const band_rows of [1, 3, 7]) {
      const png = encode(new PngStoredEncoder(5, 7), 5, 7, band_rows);
      expect(png.length).toBe(png_stored_size(5, 7));
      const decoded = await decode_png(png);
      expect(decoded).toMatchObject({ width: 5, height: 7 });
      expect(decoded.rgb).toEqual(band(5, 0, 7));
    }
  });

  test("splits large images over several stored blocks and IDAT chunks", async () => {
    const width = 700;
    const height = 600;
    const png = encode(new PngStoredEncoder(width, height), width, height, 64);
    expect(png.length).toBe(png_stored_size(width, height));
    const decoded = await decode_png(png);
    expect(decoded.chunks.filter((chunk) => chunk.type === "IDAT").length).toBe(2);
    expect(decoded.rgb).toEqual(band(width, 0, height));
  });

  test("pads to an exact size with a chunk decoders skip", async () => {
    const png = encode(new PngStoredEncoder(4, 4, 100), 4, 4, 4);
    expect(png.length).toBe(png_stored_size(4, 4) + 100);
    const decoded = await decode_png(png);
    expect(decoded.chunks.map((chunk) => chunk.type)).toEqual(["IHDR", "paDd", "IDAT", "IEND"]);
    expect(decoded.rgb).toEqual(band(4, 0, 4));
  });

  test("refuses padding too small for a chunk, wrong bands and missing rows", () => {
    expect(() => new PngStoredEncoder(4, 4, 5)).toThrow();
    const encoder = new PngStoredEncoder(4, 4);
    encoder.header();
    expect(() => encoder.push(new Uint8Array(5))).toThrow();
    encoder.push(band(4, 0, 2));
    expect(() => encoder.finish()).toThrow(/2 rows missing/);
  });
});

describe("BmpEncoder", () => {
  function decode_bmp(bmp: Uint8Array) {
    const view = new DataView(bmp.buffer, bmp.byteOffset, bmp.byteLength);
    const width = view.getInt32(18, true);
    const height = -view.getInt32(22, true);
    const start = view.getUint32(10, true);
    const stride = Math.ceil((width * 3) / 4) * 4;
    const rgb = new Uint8Array(width * height * 3);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const at = start + y * stride + x * 3;
        rgb.set([bmp[at + 2], bmp[at + 1], bmp[at]], (y * width + x) * 3);
      }
    return { file_size: view.getUint32(2, true), width, height, bits: view.getUint16(28, true), rgb };
  }

  test("writes a top-down 24-bit BMP with padded rows", () => {
    const bmp = encode(new BmpEncoder(5, 3), 5, 3, 2);
    expect(String.fromCharCode(bmp[0], bmp[1])).toBe("BM");
    expect(bmp.length).toBe(bmp_size(5, 3));
    expect(bmp_size(5, 3)).toBe(54 + 16 * 3);
    const decoded = decode_bmp(bmp);
    expect(decoded).toMatchObject({ file_size: bmp.length, width: 5, height: 3, bits: 24 });
    expect(decoded.rgb).toEqual(band(5, 0, 3));
  });

  test("puts padding between the header and the pixels", () => {
    const bmp = encode(new BmpEncoder(2, 2, 10), 2, 2, 2);
    expect(bmp.length).toBe(bmp_size(2, 2) + 10);
    expect(decode_bmp(bmp).rgb).toEqual(band(2, 0, 2));
  });

  test("refuses files over 4 GB", () => {
    expect(() => new BmpEncoder(40_000, 40_000)).toThrow(/4 GB/);
  });
});
