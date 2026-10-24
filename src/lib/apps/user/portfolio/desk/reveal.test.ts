import { describe, expect, test } from "vitest";
import { cuts, glide_time } from "./reveal";

describe("page glides", () => {
  test("a longer way takes longer, within bounds", () => {
    expect(glide_time(100)).toBeLessThan(glide_time(800));
    expect(glide_time(-800)).toBe(glide_time(800));
    expect(glide_time(100_000)).toBe(760);
  });

  test("never faster than about 60px a frame at the peak of the ease", () => {
    for (const distance of [200, 600, 900, 1200]) {
      const peak = (Math.PI / 2) * (distance / glide_time(distance));
      if (!cuts(distance, 650)) expect(peak * 16.7).toBeLessThanOrEqual(60);
    }
  });

  test("a way longer than one and a half screens cuts instead of whipping past", () => {
    expect(cuts(900, 650)).toBe(false);
    expect(cuts(1000, 650)).toBe(true);
    expect(cuts(-2400, 650)).toBe(true);
  });
});
