import { expect, test } from "vitest";
import { create_ship } from "./lander";
import { ship_coefficients, ShipId } from "./ships";
import { camera_height, ease_span, ship_pixels, view_span, type SpanEase } from "./view";

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

test("turning a full circle at a steady height leaves the span where it was", () => {
  const c = ship_coefficients(ShipId.LANDER);
  const low = Math.min(...c.spec.feet.map((p) => p.z));
  const spans = new Set<number>();
  for (let deg = 0; deg < 360; deg += 15) {
    const ship = { ...create_ship(c, 0, 40), angle: (deg * Math.PI) / 180 };
    spans.add(view_span({ height: camera_height(ship.y, 0, low), side: 358, clear: 700, size: 4.6, tall: true }));
  }
  expect(spans.size).toBe(1);
});

test("a hover bobbing a metre barely moves the zoom", () => {
  let eased: SpanEase | null = null;
  const first = view_span({ height: 20, side: 358, clear: 700, size: 4.6, tall: true });
  let lo = Infinity;
  let hi = 0;
  for (let t = 0; t < 20; t += 1 / 60) {
    const height = 20 + Math.sin(t * 1.3);
    eased = ease_span(eased, view_span({ height, side: 358, clear: 700, size: 4.6, tall: true }), 1 / 60);
    lo = Math.min(lo, eased.span);
    hi = Math.max(hi, eased.span);
  }
  expect(hi / lo).toBeLessThan(1.03);
  expect(Math.abs(lo / first - 1)).toBeLessThan(0.03);
});
