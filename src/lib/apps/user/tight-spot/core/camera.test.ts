import { describe, expect, test } from "vitest";
import { frame } from "./camera";

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
