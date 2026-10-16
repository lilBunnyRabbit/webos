import { describe, expect, test } from "vitest";
import { is_dark, MIN_COLOUR_CONTRAST, MIN_TEXT_CONTRAST, oklch_lightness, random_theme } from "./random-theme";
import { BRAND_DARK, BRAND_LIGHT } from "./themes";

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

describe("random theme", () => {
  test.each([true, false])("keeps the mode and readable gaps (dark %s)", (dark) => {
    const rand = seeded(42);
    for (let run = 0; run < 200; run++) {
      const theme = random_theme(dark, rand);
      const background = oklch_lightness(theme.background)!;
      expect(is_dark(theme)).toBe(dark);
      expect(Math.abs(oklch_lightness(theme.foreground)! - background)).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
      for (const colour of [theme.primary, theme.secondary, theme.accent]) {
        expect(Math.abs(oklch_lightness(colour)! - background)).toBeGreaterThanOrEqual(MIN_COLOUR_CONTRAST);
      }
    }
  });

  test("tells the brand themes apart, and reads percent lightness", () => {
    expect(is_dark(BRAND_DARK)).toBe(true);
    expect(is_dark(BRAND_LIGHT)).toBe(false);
    expect(oklch_lightness("oklch(95% 0.01 80)")).toBe(0.95);
    expect(is_dark({ background: "#fff" })).toBe(true);
  });
});
