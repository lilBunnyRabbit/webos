import { describe, expect, test } from "vitest";
import { format_value, line_path, to_csv, value_range } from "./chart";

describe("chart", () => {
  test("range pads and ignores non-finite values", () => {
    expect(value_range([[0, 10, Infinity, NaN]])).toEqual({ min: -0.5, max: 10.5 });
    expect(value_range([[3, 3]])).toEqual({ min: 2, max: 4 });
    expect(value_range([[NaN]])).toBeNull();
  });

  test("a non-finite value breaks the line", () => {
    expect(line_path([0, 1, Infinity, 1], 4, { min: 0, max: 1 }, 30, 10)).toBe("M0.0,10.0L10.0,0.0M30.0,0.0");
  });

  test("values read cleanly", () => {
    expect(format_value(0.12345)).toBe("0.123");
    expect(format_value(-0.0001)).toBe("0");
    expect(format_value(-Infinity)).toBe("−∞");
    expect(format_value("Boom 50")).toBe('"Boom 50"');
  });

  test("csv quotes strings", () => {
    expect(to_csv(["t", "weapon"], [[0, 'a "b"']])).toBe('"t","weapon"\n0,"a ""b"""\n');
  });
});
