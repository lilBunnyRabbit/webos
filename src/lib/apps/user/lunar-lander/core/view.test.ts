import { expect, test } from "vitest";
import { ship_pixels, view_span } from "./view";

const pixels = (span: number, side: number, size: number) => (size * side) / span;

test("high above the base the ship keeps its pixel floor on a phone and a desktop", () => {
  for (const side of [358, 520]) {
    const span = view_span({ height: 482, side, clear: side * 2.2, size: 4.6, tall: true });
    expect(pixels(span, side, 4.6)).toBeGreaterThanOrEqual(55 - 0.01);
  }
});

test("in the descent the ground stays in the view, the ship at least 32 px", () => {
  for (const height of [8, 20, 28]) {
    const span = view_span({ height, side: 520, clear: 420, size: 4.6, tall: false });
    expect(((height + 14) * 520) / span).toBeLessThanOrEqual(420 * 0.7 + 0.01);
    expect(pixels(span, 520, 4.6)).toBeGreaterThanOrEqual(ship_pixels(520, height) - 0.01);
  }
});
