import { describe, expect, test } from "vitest";
import { CODE128_PATTERNS, gtin_check, pattern_variance, upce_to_upca } from "./symbologies";
import { binarize_by_histogram, binarize_by_midrange, runs_of } from ".";

describe("tables", () => {
  test("every Code 128 symbol is 11 modules and unique", () => {
    expect(CODE128_PATTERNS).toHaveLength(106);
    for (const pattern of CODE128_PATTERNS) expect(pattern.reduce((sum, width) => sum + width, 0)).toBe(11);
    expect(new Set(CODE128_PATTERNS.map((pattern) => pattern.join(""))).size).toBe(106);
  });

  test("GTIN check digit and UPC-E expansion", () => {
    expect(gtin_check("400638133393")).toBe(1);
    expect(upce_to_upca("04252614")).toBe("04210000526");
  });
});

describe("pattern_variance", () => {
  test("scales to the runs' own module width", () => {
    expect(pattern_variance([4, 4, 4], 0, [1, 1, 1])).toBe(0);
    expect(pattern_variance([6, 3, 3], 0, [2, 1, 1])).toBe(0);
    expect(pattern_variance([9, 3, 3], 0, [1, 1, 1])).toBe(Infinity);
  });

  test("rejects runs narrower than a pixel per module", () => {
    expect(pattern_variance([1, 1, 1], 0, [2, 2, 2])).toBe(Infinity);
  });
});

describe("runs", () => {
  test("start with light, zero wide when the line starts dark", () => {
    expect(runs_of(new Uint8Array([0, 0, 1, 1, 1, 0]))).toEqual([2, 3, 1]);
    expect(runs_of(new Uint8Array([1, 0, 0]))).toEqual([0, 1, 2]);
  });

  test("a flat line has no threshold", () => {
    expect(binarize_by_histogram(new Uint8Array(100).fill(120))).toBeNull();
  });

  test("midrange keeps blurred bar widths and reads a quiet zone as light", () => {
    const sharp = Array.from({ length: 120 }, (_, x) => (x >= 40 && x < 82 && Math.floor((x - 40) / 6) % 2 === 0 ? 20 : 230));
    const soft = new Uint8Array(sharp.map((value, x) => ((sharp[x - 2] ?? value) + (sharp[x - 1] ?? value) * 2 + value * 2 + (sharp[x + 1] ?? value) * 2 + (sharp[x + 2] ?? value)) / 8));
    const runs = runs_of(binarize_by_midrange(soft));
    expect(runs[0]).toBe(40);
    expect(runs.slice(1, -1)).toEqual([6, 6, 6, 6, 6, 6, 6]);
  });
});
