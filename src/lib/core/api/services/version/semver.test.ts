import { describe, expect, test } from "vitest";
import { compare_versions } from "./semver";

describe("compare_versions", () => {
  test("compares numerically, not as strings", () => {
    expect(compare_versions("0.8.2", "0.8.10")).toBeLessThan(0);
    expect(compare_versions("0.10.0", "0.9.9")).toBeGreaterThan(0);
  });

  test("equal versions compare to 0", () => {
    expect(compare_versions("1.2.3", "1.2.3")).toBe(0);
  });

  test("missing parts count as 0", () => {
    expect(compare_versions("1", "1.0.0")).toBe(0);
    expect(compare_versions("1.2", "1.2.1")).toBeLessThan(0);
  });
});
