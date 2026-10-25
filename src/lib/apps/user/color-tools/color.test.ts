import { describe, expect, test } from "vitest";
import {
  contrast_ratio,
  delta_e2000,
  from_hex,
  hsv,
  in_srgb_gamut,
  lab65,
  oklch,
  rgb8,
  to_hex,
  to_hsv,
  to_lab65,
  to_oklch,
} from "./color";

describe("color wrappers", () => {
  test("hex and names read through the byte model", () => {
    expect(to_hex("#FF8000")).toBe("#ff8000");
    expect(to_hex("rebeccapurple")).toBe("#663399");
    expect(from_hex("not a colour")).toBeNull();
    expect(to_hex(rgb8(1, 2, 3))).toBe("#010203");
  });

  test("conversions return plain values in the package's units", () => {
    const red = to_oklch("#ff0000");
    expect(red.l).toBeCloseTo(0.628, 3);
    expect(red.c).toBeCloseTo(0.2577, 3);
    expect(red.h).toBeCloseTo(29.23, 1);
    expect(to_hsv("#00ff00")).toEqual({ h: 120, s: 1, v: 1, alpha: 1 });
    expect(to_lab65("#ffffff").l).toBeCloseTo(100, 3);
    expect(to_hex(hsv(240, 1, 1))).toBe("#0000ff");
    expect(to_hex(lab65(0, 0, 0))).toBe("#000000");
  });

  test("an out-of-gamut colour is mapped for display, keeping its hue", () => {
    const vivid = oklch(0.7, 0.4, 145);
    expect(in_srgb_gamut(vivid)).toBe(false);
    const hex = to_hex(vivid);
    expect(hex).toMatch(/^#[0-9a-f]{6}$/);
    expect(in_srgb_gamut(hex)).toBe(true);
    expect(Math.abs(to_oklch(hex).h - 145)).toBeLessThan(5);
  });

  test("translucent colours keep their alpha in hex", () => {
    expect(to_hex(oklch(0.4, 0.1, 220, 0.5))).toMatch(/^#[0-9a-f]{6}80$/);
  });

  test("WCAG ratio: black on white is 21, a colour on itself is 1", () => {
    expect(contrast_ratio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrast_ratio("#777777", "#777777")).toBeCloseTo(1, 5);
    expect(contrast_ratio("#767676", "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });

  test("a translucent foreground is composited over the background first", () => {
    expect(contrast_ratio("#00000000", "#ffffff")).toBeCloseTo(1, 5);
    expect(contrast_ratio("#00000080", "#ffffff")).toBeLessThan(contrast_ratio("#000000", "#ffffff"));
  });

  test("CIEDE2000", () => {
    expect(delta_e2000("#336699", "#336699")).toBe(0);
    expect(delta_e2000("#000000", "#ffffff")).toBeCloseTo(100, 0);
    expect(delta_e2000("#ff0000", "#fe0000")).toBeLessThan(1);
  });
});
