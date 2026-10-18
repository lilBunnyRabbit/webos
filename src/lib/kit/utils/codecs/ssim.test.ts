import { describe, expect, it } from "vitest";
import { create_rng } from "$lib/core/utils/random";
import { ssim, type Pixels } from "./ssim";

function gradient(width: number, height: number): Pixels {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      data[offset] = (x * 255) / width;
      data[offset + 1] = (y * 255) / height;
      data[offset + 2] = ((x ^ y) & 15) * 16;
      data[offset + 3] = 255;
    }
  }
  return { width, height, data };
}

function noisy(source: Pixels, amount: number, seed: number): Pixels {
  const rng = create_rng(seed);
  const data = new Uint8ClampedArray(source.data);
  for (let index = 0; index < data.length; index++) {
    if (index % 4 !== 3) data[index] += (rng() - 0.5) * 2 * amount;
  }
  return { ...source, data };
}

describe("ssim", () => {
  it("gives 1 for identical images", () => {
    const image = gradient(64, 48);
    const result = ssim(image, { ...image, data: new Uint8ClampedArray(image.data) });
    expect(result.score).toBeCloseTo(1, 10);
    expect(result.map_width).toBe(15);
    expect(result.map_height).toBe(11);
    expect(result.map.every((value) => Math.abs(value - 1) < 1e-9)).toBe(true);
  });

  it("drops as noise grows", () => {
    const image = gradient(64, 64);
    const light = ssim(image, noisy(image, 8, 1)).score;
    const heavy = ssim(image, noisy(image, 60, 1)).score;
    expect(light).toBeLessThan(1);
    expect(heavy).toBeLessThan(light);
    expect(heavy).toBeGreaterThan(-1);
  });

  it("marks the windows that changed", () => {
    const image = gradient(32, 32);
    const changed = { ...image, data: new Uint8ClampedArray(image.data) };
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) changed.data[(y * 32 + x) * 4] = 0;
    const { map, map_width } = ssim(image, changed);
    expect(map[0]).toBeLessThan(0.99);
    expect(map[map_width * 6 + 6]).toBeCloseTo(1, 10);
  });

  it("treats transparency as white", () => {
    const transparent: Pixels = { width: 8, height: 8, data: new Uint8ClampedArray(8 * 8 * 4) };
    const white: Pixels = { width: 8, height: 8, data: new Uint8ClampedArray(8 * 8 * 4).fill(255) };
    expect(ssim(transparent, white).score).toBeCloseTo(1, 10);
  });

  it("handles images smaller than a window", () => {
    const image = gradient(3, 5);
    expect(ssim(image, image).map.length).toBe(1);
  });

  it("refuses images of different sizes", () => {
    expect(() => ssim(gradient(8, 8), gradient(9, 8))).toThrow();
  });
});
