import { describe, expect, test } from "vitest";
import { create_rng, random_int, shuffle } from "./random";

describe("create_rng", () => {
  test("stays in [0, 1)", () => {
    const rng = create_rng(123);
    for (let i = 0; i < 1000; i++) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe("helpers", () => {
  test("random_int covers both ends", () => {
    const rng = create_rng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(random_int(1, 4, rng));
    expect([...seen].sort()).toEqual([1, 2, 3, 4]);
  });

  test("the same seed replays the same shuffle", () => {
    const items = () => Array.from({ length: 10 }, (_, i) => i);
    expect(shuffle(items(), create_rng(9))).toEqual(shuffle(items(), create_rng(9)));
  });
});
