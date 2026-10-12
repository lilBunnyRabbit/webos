import { describe, expect, test } from "vitest";
import { random_int, sample, shuffle, type RandomSource } from "./random";

function sequence(...values: number[]): RandomSource & { calls: number } {
  const source = Object.assign(
    () => {
      if (source.calls >= values.length) throw new Error("Source exhausted");
      return values[source.calls++];
    },
    { calls: 0 }
  );
  return source;
}

const MAX_UINT32 = 2 ** 32 - 1;

describe("random_int", () => {
  test("maps the lowest and highest accepted draws onto the bounds", () => {
    expect(random_int(1, 6, sequence(0))).toBe(1);
    const span = 6;
    const last_accepted = 2 ** 32 - (2 ** 32 % span) - 1;
    expect(random_int(1, 6, sequence(last_accepted))).toBe(6);
  });

  test("rejects draws in the incomplete last block instead of folding them", () => {
    const source = sequence(MAX_UINT32, MAX_UINT32 - 1, 7);
    expect(random_int(1, 6, source)).toBe(1 + (7 % 6));
    expect(source.calls).toBe(3);
  });

  test("never rejects when the span divides 2^32", () => {
    const source = sequence(MAX_UINT32);
    expect(random_int(0, 255, source)).toBe(255);
    expect(source.calls).toBe(1);
  });

  test("returns the only value of a one-wide range without drawing", () => {
    const source = sequence();
    expect(random_int(5, 5, source)).toBe(5);
  });

  test("handles negative ranges", () => {
    expect(random_int(-3, -1, sequence(0))).toBe(-3);
    expect(random_int(-3, -1, sequence(2))).toBe(-1);
  });

  test("spans above 2^32 combine two draws and stay in bounds", () => {
    const max = Number.MAX_SAFE_INTEGER;
    expect(random_int(0, max, sequence(0, 0))).toBe(0);
    expect(random_int(0, max, sequence(MAX_UINT32, MAX_UINT32))).toBe(max);
  });

  test("rejects bad bounds", () => {
    expect(() => random_int(2, 1)).toThrow(RangeError);
    expect(() => random_int(0.5, 1)).toThrow(RangeError);
    expect(() => random_int(Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)).toThrow(RangeError);
  });

  test("stays inside the bounds and hits every value with real randomness", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const value = random_int(-2, 7);
      expect(value).toBeGreaterThanOrEqual(-2);
      expect(value).toBeLessThanOrEqual(7);
      seen.add(value);
    }
    expect(seen.size).toBe(10);
  });
});

describe("shuffle", () => {
  test("is a permutation of the input", () => {
    const items = Array.from({ length: 50 }, (_, i) => i);
    const result = shuffle(items);
    expect(result).toHaveLength(items.length);
    expect([...result].sort((a, b) => a - b)).toEqual(items);
  });

  test("keeps duplicates and leaves the input untouched", () => {
    const items = ["a", "a", "b"];
    const result = shuffle(items);
    expect([...result].sort()).toEqual(["a", "a", "b"]);
    expect(items).toEqual(["a", "a", "b"]);
  });

  test("can produce every ordering of three items", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) seen.add(shuffle([1, 2, 3]).join(""));
    expect(seen.size).toBe(6);
  });
});

describe("sample", () => {
  test("returns distinct entries from the input", () => {
    const items = Array.from({ length: 20 }, (_, i) => i);
    const result = sample(items, 8);
    expect(result).toHaveLength(8);
    expect(new Set(result).size).toBe(8);
    for (const item of result) expect(items).toContain(item);
  });

  test("caps the count at the input size", () => {
    expect(sample([1, 2, 3], 10)).toHaveLength(3);
    expect(sample([1, 2, 3], 0)).toEqual([]);
  });
});
