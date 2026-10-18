import jsqr from "jsqr";
import { encode } from "uqr";
import { describe, expect, test } from "vitest";
import { fit_within, qr_path } from "./qr";

describe("fit_within", () => {
  test("scales a landscape size down to the max on its long side", () => {
    expect(fit_within(1920, 1080, 1024)).toEqual({ width: 1024, height: 576 });
  });

  test("scales a portrait size down to the max on its long side", () => {
    expect(fit_within(1080, 1920, 200)).toEqual({ width: 113, height: 200 });
  });

  test("never scales up", () => {
    expect(fit_within(120, 80, 1024)).toEqual({ width: 120, height: 80 });
  });

  test("keeps at least one pixel per side", () => {
    expect(fit_within(10000, 1, 200)).toEqual({ width: 200, height: 1 });
  });
});

describe("qr_path", () => {
  const TEXT = "WEBOS-P2P1|o|Xf3k|q0Zt3nWm8VbR1yLp6sHc2dJa|XH4POzohRNhuEQK7fJA9r-FYanLDDZQeKYtF9gDHOhI|x|h,6f1c8a3e.local,59341";

  test("draws one square per dark module, inside a 4-module quiet zone", () => {
    const { size, d } = qr_path(TEXT);
    const dark = encode(TEXT, { ecc: "L", border: 4 }).data.flat().filter(Boolean).length;
    expect(d.match(/M/g)).toHaveLength(dark);
    expect(d).not.toMatch(/M[0-3] /);
    expect(size).toBeGreaterThan(21 + 8);
  });

  test("decodes back to the text", () => {
    const { data, size } = encode(TEXT, { ecc: "L", border: 4 });
    const scale = 4;
    const width = size * scale;
    const pixels = new Uint8ClampedArray(width * width * 4);
    for (let y = 0; y < width; y++)
      for (let x = 0; x < width; x++) {
        const value = data[Math.floor(y / scale)][Math.floor(x / scale)] ? 0 : 255;
        pixels.set([value, value, value, 255], (y * width + x) * 4);
      }
    expect(jsqr(pixels, width, width)?.data).toBe(TEXT);
  });
});
