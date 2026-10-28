import { describe, expect, test } from "vitest";
import { fit_span, frame } from "./camera";

const WORLD = { x0: -100, y0: -100, x1: 100, y1: 100 };

describe("frame", () => {
  test("without insets the focus is the centre", () => {
    const view = frame(WORLD, { x: 3, y: 4 }, 400, 800, 1);
    expect(view.x).toBeCloseTo(3);
    expect(view.y).toBeCloseTo(4);
  });

  test("the focus sits in the middle of the part the controls leave clear", () => {
    const insets = { top: 40, right: 0, bottom: 200, left: 0 };
    const view = frame(WORLD, { x: 0, y: 0 }, 400, 800, 1, insets);
    const focus_px = (0 - view.y) * view.scale + 800 / 2;
    expect(focus_px).toBeCloseTo((40 + (800 - 200)) / 2);
    const sides = frame(WORLD, { x: 0, y: 0 }, 800, 400, 1, { top: 0, right: 150, bottom: 0, left: 250 });
    expect((0 - sides.x) * sides.scale + 800 / 2).toBeCloseTo((250 + 800 - 150) / 2);
  });

  test("insets don't change the zoom", () => {
    expect(frame(WORLD, { x: 0, y: 0 }, 400, 800, 1, { top: 50, right: 50, bottom: 300, left: 50 }).scale).toBe(frame(WORLD, { x: 0, y: 0 }, 400, 800, 1).scale);
  });

  test("near the world's edge the car still clears the controls, the edge slides under them", () => {
    const insets = { top: 0, right: 0, bottom: 200, left: 0 };
    const view = frame(WORLD, { x: 0, y: 99 }, 400, 800, 1, insets);
    const focus_px = (99 - view.y) * view.scale + 800 / 2;
    expect(focus_px).toBeLessThanOrEqual(800 - 200);
    const edge_px = (100 - view.y) * view.scale + 800 / 2;
    expect(edge_px).toBeGreaterThanOrEqual(800 - 200 - 1e-6);
  });
});

describe("fit_span", () => {
  const YARD = { x0: 0, y0: 0, x1: 56, y1: 44 };
  const edges = (view: { x: number; y: number; scale: number }, width: number, height: number) => ({
    left: (YARD.x0 - view.x) * view.scale + width / 2,
    right: (YARD.x1 - view.x) * view.scale + width / 2,
    top: (YARD.y0 - view.y) * view.scale + height / 2,
    bottom: (YARD.y1 - view.y) * view.scale + height / 2,
  });

  test("the whole world shows in the clear part of a tall board", () => {
    const insets = { top: 52, right: 0, bottom: 180, left: 0 };
    const span = fit_span(YARD, 375, 640, insets, 1);
    const at = edges(frame(YARD, { x: 28, y: 22 }, 375, 640, 1, insets, span), 375, 640);
    expect(at.left).toBeGreaterThanOrEqual(0);
    expect(at.right).toBeLessThanOrEqual(375);
    expect(at.top).toBeGreaterThanOrEqual(52 - 1e-6);
    expect(at.bottom).toBeLessThanOrEqual(640 - 180 + 1e-6);
  });

  test("between the side controls of a wide board", () => {
    const insets = { top: 40, right: 200, bottom: 0, left: 220 };
    const span = fit_span(YARD, 844, 340, insets);
    const at = edges(frame(YARD, { x: 28, y: 22 }, 844, 340, 1, insets, span), 844, 340);
    expect(at.left).toBeGreaterThanOrEqual(220 - 1e-6);
    expect(at.right).toBeLessThanOrEqual(844 - 200 + 1e-6);
    expect(at.top).toBeGreaterThanOrEqual(40 - 1e-6);
    expect(at.bottom).toBeLessThanOrEqual(340 + 1e-6);
  });
});
