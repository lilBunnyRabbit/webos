import { describe, expect, test } from "vitest";
import { check_numbers, generate_numbers } from "./numbers";

describe("generate_numbers", () => {
  test("returns count values inside the bounds", () => {
    const values = generate_numbers({ min: -5, max: 5, count: 500, unique: false });
    expect(values).toHaveLength(500);
    for (const value of values) {
      expect(value).toBeGreaterThanOrEqual(-5);
      expect(value).toBeLessThanOrEqual(5);
    }
  });

  test("unique fills a whole small range exactly once", () => {
    const values = generate_numbers({ min: 1, max: 50, count: 50, unique: true });
    expect([...values].sort((a, b) => a - b)).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
  });

  test("unique stays distinct over a huge range", () => {
    const values = generate_numbers({ min: 0, max: 2 ** 40, count: 1000, unique: true });
    expect(new Set(values).size).toBe(1000);
  });
});

describe("check_numbers", () => {
  test("flags impossible or empty settings", () => {
    expect(check_numbers({ min: 5, max: 1, count: 1, unique: false }).ok).toBe(false);
    expect(check_numbers({ min: 1, max: 3, count: 4, unique: true }).ok).toBe(false);
    expect(check_numbers({ min: 1, max: 3, count: 0, unique: false }).ok).toBe(false);
    expect(check_numbers({ min: null, max: 3, count: 1, unique: false }).ok).toBe(false);
    expect(check_numbers({ min: 1, max: 3, count: null, unique: false }).ok).toBe(false);
    expect(check_numbers({ min: 1, max: 3, count: 4, unique: false })).toEqual({
      ok: true,
      value: { min: 1, max: 3, count: 4, unique: false },
    });
  });
});
