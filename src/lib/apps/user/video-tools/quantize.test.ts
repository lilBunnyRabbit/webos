import { describe, expect, it } from "vitest";
import { map_pixels, median_cut, PaletteLookup } from "./quantize";

type Rgb = [number, number, number];

function image(colors: Rgb[], repeat = 1): Uint8Array {
  const out = new Uint8Array(colors.length * repeat * 4);
  colors.forEach(([r, g, b], i) => {
    for (let copy = 0; copy < repeat; copy++) out.set([r, g, b, 255], (i * repeat + copy) * 4);
  });
  return out;
}

function triplets(palette: Uint8Array): number[][] {
  return Array.from({ length: palette.length / 3 }, (_, i) => [...palette.subarray(i * 3, i * 3 + 3)]).sort(
    (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]
  );
}

function gradient(width: number, height: number): Uint8Array {
  const out = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      out.set(
        [Math.round((x / (width - 1)) * 255), Math.round((y / (height - 1)) * 255), 128, 255],
        (y * width + x) * 4
      );
    }
  return out;
}

describe("median_cut", () => {
  it("keeps a few distinct colours exactly", () => {
    const colors: Rgb[] = [
      [255, 0, 0],
      [0, 255, 0],
      [0, 0, 255],
      [255, 255, 255],
    ];
    expect(triplets(median_cut(image(colors, 10), 16))).toEqual(triplets(new Uint8Array(colors.flat())));
  });

  it("never returns more colours than asked", () => {
    expect(median_cut(gradient(64, 64), 16).length).toBe(16 * 3);
    expect(median_cut(gradient(64, 64), 256).length).toBeLessThanOrEqual(256 * 3);
  });

  it("averages the pixels a box holds", () => {
    expect([
      ...median_cut(
        image([
          [10, 20, 30],
          [12, 22, 32],
        ]),
        1
      ),
    ]).toEqual([11, 21, 31]);
  });

  it("gives more entries to the colours most pixels use", () => {
    const reds = Array.from({ length: 50 }, (_, i): Rgb => [i * 4, 0, 0]);
    const palette = triplets(median_cut(image([...reds, [0, 0, 255]], 20), 8));
    expect(palette.filter(([, , b]) => b > 200)).toHaveLength(1);
    expect(palette.filter(([, , b]) => b < 50)).toHaveLength(7);
  });

  it("returns one black entry for an empty image", () => {
    expect([...median_cut(new Uint8Array(0), 8)]).toEqual([0, 0, 0]);
  });
});

describe("map_pixels", () => {
  const palette = new Uint8Array([0, 0, 0, 255, 255, 255]);

  it("picks the nearest entry without dithering", () => {
    expect([
      ...map_pixels(
        image([
          [10, 10, 10],
          [200, 210, 220],
          [120, 120, 120],
        ]),
        3,
        1,
        palette,
        false
      ),
    ]).toEqual([0, 1, 0]);
  });

  it("keeps the average brightness of a flat grey when dithering", () => {
    const grey = image([[128, 128, 128]], 32 * 32);
    const plain = map_pixels(grey, 32, 32, palette, false);
    const dithered = map_pixels(grey, 32, 32, palette, true);
    expect(plain.every((index) => index === plain[0])).toBe(true);
    const white = dithered.reduce((sum, index) => sum + index, 0) / dithered.length;
    expect(white).toBeGreaterThan(0.45);
    expect(white).toBeLessThan(0.55);
  });

  it("leaves exact palette colours alone when dithering", () => {
    const checker = image([
      [0, 0, 0],
      [255, 255, 255],
      [0, 0, 0],
      [255, 255, 255],
    ]);
    expect([...map_pixels(checker, 2, 2, palette, true)]).toEqual([0, 1, 0, 1]);
  });

  it("caches lookups per colour cell", () => {
    const lookup = new PaletteLookup(new Uint8Array([0, 0, 0, 250, 0, 0]));
    expect(lookup.nearest(200, 0, 0)).toBe(1);
    expect(lookup.nearest(201, 1, 2)).toBe(1);
    expect(lookup.nearest(20, 0, 0)).toBe(0);
  });
});
