import { describe, expect, test } from "vitest";
import { bmp_size, BmpEncoder, encode_bmp } from "./bmp";
import { concat_bytes } from "./pixels";

function pixel_at(x: number, y: number): [number, number, number] {
  return [(x * 7 + y) & 255, (y * 13) & 255, (x ^ y) & 255];
}

function band(width: number, from: number, rows: number): Uint8Array {
  const out = new Uint8Array(width * rows * 3);
  for (let j = 0; j < rows; j++) for (let x = 0; x < width; x++) out.set(pixel_at(x, from + j), (j * width + x) * 3);
  return out;
}

function encode(encoder: BmpEncoder, width: number, height: number, band_rows: number): Uint8Array {
  const parts = [...encoder.header()];
  for (let y = 0; y < height; y += band_rows) parts.push(...encoder.push(band(width, y, Math.min(band_rows, height - y))));
  parts.push(...encoder.finish());
  return concat_bytes(parts);
}

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

describe("BmpEncoder", () => {
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

describe("encode_bmp", () => {
  test("an opaque image is 24-bit", () => {
    const data = new Uint8Array([10, 20, 30, 255, 40, 50, 60, 255, 70, 80, 90, 255]);
    const bmp = encode_bmp({ width: 3, height: 1, data });
    const decoded = decode_bmp(bmp);
    expect(decoded).toMatchObject({ width: 3, height: 1, bits: 24, file_size: bmp.length });
    expect([...decoded.rgb]).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90]);
  });

  test("transparency makes it 32-bit BGRA with an alpha mask", () => {
    const data = new Uint8Array([255, 0, 0, 128, 0, 255, 0, 0]);
    const bmp = encode_bmp({ width: 2, height: 1, data });
    const view = new DataView(bmp.buffer);
    expect(view.getUint32(10, true)).toBe(122);
    expect(view.getUint32(14, true)).toBe(108);
    expect(view.getUint16(28, true)).toBe(32);
    expect(view.getUint32(30, true)).toBe(3);
    expect(view.getUint32(66, true)).toBe(0xff000000);
    expect(bmp.length).toBe(122 + 8);
    expect([...bmp.subarray(122)]).toEqual([0, 0, 255, 128, 0, 255, 0, 0]);
  });
});
