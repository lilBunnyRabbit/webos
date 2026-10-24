import { describe, expect, test } from "vitest";
import { write_ico } from "./ico";

const fake_png = (length: number, fill: number) => new Uint8Array(length).fill(fill);

describe("write_ico", () => {
  test("writes a directory of PNG entries followed by their bytes", () => {
    const entries = [
      { size: 16, png: fake_png(10, 1) },
      { size: 32, png: fake_png(20, 2) },
      { size: 48, png: fake_png(30, 3) },
    ];
    const bytes = write_ico(entries);
    const view = new DataView(bytes.buffer);

    expect(view.getUint16(0, true)).toBe(0);
    expect(view.getUint16(2, true)).toBe(1);
    expect(view.getUint16(4, true)).toBe(3);
    expect(bytes.length).toBe(6 + 3 * 16 + 60);

    let offset = 6 + 3 * 16;
    entries.forEach(({ size, png }, index) => {
      const at = 6 + index * 16;
      expect(bytes[at]).toBe(size);
      expect(bytes[at + 1]).toBe(size);
      expect(bytes[at + 2]).toBe(0);
      expect(bytes[at + 3]).toBe(0);
      expect(view.getUint16(at + 4, true)).toBe(1);
      expect(view.getUint16(at + 6, true)).toBe(32);
      expect(view.getUint32(at + 8, true)).toBe(png.length);
      expect(view.getUint32(at + 12, true)).toBe(offset);
      expect(Array.from(bytes.subarray(offset, offset + png.length))).toEqual(Array.from(png));
      offset += png.length;
    });
  });

  test("stores 256 px as 0", () => {
    const bytes = write_ico([{ size: 256, png: fake_png(4, 9) }]);
    expect(bytes[6]).toBe(0);
    expect(bytes[7]).toBe(0);
  });

  test("refuses no images and sizes an icon can't hold", () => {
    expect(() => write_ico([])).toThrow();
    expect(() => write_ico([{ size: 257, png: fake_png(1, 0) }])).toThrow();
    expect(() => write_ico([{ size: 0, png: fake_png(1, 0) }])).toThrow();
  });
});
