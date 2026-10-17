import { expect, test } from "vitest";
import { FIT, MAX_ZOOM, clamp_camera, fit_box, pinch, zoom_at } from "./camera";

test("zoom_at keeps the point under the cursor", () => {
  const camera = zoom_at(FIT, 2, { x: 50, y: -20 });
  expect(camera).toEqual({ scale: 2, x: -50, y: 20 });
  const point = { x: 50, y: -20 };
  const before = { x: (point.x - FIT.x) / FIT.scale, y: (point.y - FIT.y) / FIT.scale };
  const after = { x: (point.x - camera.x) / camera.scale, y: (point.y - camera.y) / camera.scale };
  expect(after).toEqual(before);
});

test("zoom stays between fit and the maximum", () => {
  expect(zoom_at(FIT, 0.5, { x: 10, y: 10 }).scale).toBe(1);
  expect(zoom_at({ scale: 20, x: 0, y: 0 }, 4, { x: 0, y: 0 }).scale).toBe(MAX_ZOOM);
});

test("pinch follows the midpoint and scales by the spread", () => {
  expect(pinch(FIT, { x: 0, y: 0 }, 100, { x: 30, y: 10 }, 200)).toEqual({ scale: 2, x: 30, y: 10 });
});

test("clamp_camera centres at fit and lets a zoomed image pan to its edge", () => {
  expect(clamp_camera({ scale: 1, x: 40, y: -5 }, 200, 100)).toEqual(FIT);
  expect(clamp_camera({ scale: 3, x: 500, y: -500 }, 200, 100)).toEqual({ scale: 3, x: 200, y: -100 });
});

test("fit_box", () => {
  expect(fit_box(2, 400, 400)).toEqual({ width: 400, height: 200 });
  expect(fit_box(0.5, 400, 400)).toEqual({ width: 200, height: 400 });
});
