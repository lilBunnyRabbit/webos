import { describe, expect, it } from "vitest";
import {
  best_match,
  downsample,
  gray,
  integral,
  ncc_at,
  parabolic_peak,
  prepare_template,
  sample_patch,
  to_gray,
  type Gray,
} from "./ncc";

function noise(width: number, height: number, seed = 7): Gray {
  const image = gray(width, height);
  let state = seed;
  for (let i = 0; i < image.data.length; i++) {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    image.data[i] = state % 256;
  }
  return image;
}

function crop(image: Gray, x: number, y: number, width: number, height: number): Gray {
  const out = gray(width, height);
  for (let row = 0; row < height; row++)
    out.data.set(image.data.subarray((y + row) * image.width + x, (y + row) * image.width + x + width), row * width);
  return out;
}

describe("ncc", () => {
  it("converts RGBA to luma", () => {
    expect([...to_gray([255, 255, 255, 255, 255, 0, 0, 255], 2, 1).data].map(Math.round)).toEqual([255, 76]);
  });

  it("halves by 2×2 mean and drops an odd edge", () => {
    const image = gray(3, 2, Float32Array.from([0, 4, 9, 8, 12, 9]));
    expect(downsample(image)).toEqual({ width: 1, height: 1, data: Float32Array.from([6]) });
  });

  it("scores an exact crop 1 and an inverted one −1", () => {
    const image = noise(40, 30);
    const template = prepare_template(crop(image, 10, 5, 12, 9));
    const table = integral(image);
    expect(ncc_at(image, table, template, 10, 5)).toBeCloseTo(1, 5);
    const inverted = crop(image, 10, 5, 12, 9);
    inverted.data.forEach((value, i) => (inverted.data[i] = 255 - value));
    expect(ncc_at(image, table, prepare_template(inverted), 10, 5)).toBeCloseTo(-1, 5);
  });

  it("is blind to brightness and contrast", () => {
    const image = noise(30, 30);
    const brighter = crop(image, 4, 6, 10, 10);
    brighter.data.forEach((value, i) => (brighter.data[i] = value * 0.5 + 60));
    expect(ncc_at(image, integral(image), prepare_template(brighter), 4, 6)).toBeCloseTo(1, 5);
  });

  it("matches nothing on a flat template or flat window", () => {
    const image = gray(20, 20, new Float32Array(400).fill(100));
    expect(ncc_at(image, integral(image), prepare_template(noise(5, 5)), 2, 2)).toBe(0);
    expect(ncc_at(noise(20, 20), integral(noise(20, 20)), prepare_template(gray(5, 5)), 2, 2)).toBe(0);
  });

  it("finds the crop by exhaustive search", () => {
    const image = noise(60, 50, 3);
    const match = best_match(
      image,
      integral(image),
      prepare_template(crop(image, 31, 17, 14, 11)),
      0,
      0,
      Infinity,
      Infinity
    )!;
    expect(Math.round(match.x)).toBe(31);
    expect(Math.round(match.y)).toBe(17);
    expect(match.score).toBeCloseTo(1, 5);
  });

  it("returns null when the template doesn't fit", () => {
    const image = noise(10, 10);
    expect(best_match(image, integral(image), prepare_template(noise(12, 4)), 0, 0, 10, 10)).toBeNull();
  });

  it("places the parabola's vertex between samples", () => {
    expect(parabolic_peak(0.5, 1, 0.5)).toBe(0);
    expect(parabolic_peak(0.2, 1, 0.8)).toBeCloseTo(0.3, 5);
    expect(parabolic_peak(1, 0, 1)).toBe(0);
  });

  it("finds a sub-pixel shift of a smooth picture", () => {
    const wave = (x: number, y: number) => 128 + 60 * Math.sin(x / 3) + 50 * Math.cos(y / 4);
    const image = gray(48, 48);
    for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) image.data[y * 48 + x] = wave(x + 0.4, y - 0.3);
    const template = gray(16, 16);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) template.data[y * 16 + x] = wave(x + 20, y + 20);
    const match = best_match(image, integral(image), prepare_template(template), 15, 15, 25, 25)!;
    expect(match.x).toBeCloseTo(19.6, 0);
    expect(Math.abs(match.x - 19.6)).toBeLessThan(0.25);
    expect(Math.abs(match.y - 20.3)).toBeLessThan(0.25);
  });

  it("resamples a patch: same size is a crop, half size averages", () => {
    const image = noise(20, 20);
    expect(sample_patch(image, 8, 9, 6, 4, 6, 4).data).toEqual(crop(image, 5, 7, 6, 4).data);
    const big = sample_patch(gray(4, 4, new Float32Array(16).fill(50)), 2, 2, 4, 4, 2, 2);
    expect([...big.data]).toEqual([50, 50, 50, 50]);
  });
});
