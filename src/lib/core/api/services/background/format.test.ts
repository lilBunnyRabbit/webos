import { describe, expect, test } from "vitest";
import { format_since } from "./format";

describe("format_since", () => {
  test.each([
    [0, "0 s"],
    [59_999, "59 s"],
    [60_000, "1 min"],
    [3_600_000, "1 h"],
    [3_900_000, "1 h 5 min"],
    [90_000_000, "1 d"],
    [-5_000, "0 s"],
  ])("%i ms", (elapsed, text) => expect(format_since(1_000_000, 1_000_000 + elapsed)).toBe(text));
});
