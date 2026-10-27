import { describe, expect, test } from "vitest";
import { pinch_camera, pinch_start, snap_rotation, to_screen, to_sketch, turn_camera, type Camera } from "./rotation";

const DEG = Math.PI / 180;
const CAMERA: Camera = { view: { scale: 2, offset_x: 50, offset_y: 30 }, rotation: 0 };

function close(a: { x: number; y: number }, b: { x: number; y: number }) {
  expect(a.x).toBeCloseTo(b.x);
  expect(a.y).toBeCloseTo(b.y);
}

describe("rotation", () => {
  test("a tap maps back to the sketch point drawn under it, at any turn", () => {
    const camera = { ...CAMERA, rotation: 37 * DEG };
    const p = { x: 12, y: -40 };
    close(to_sketch(camera, to_screen(camera, p)), p);
  });

  test("a quarter turn clockwise sends right to down", () => {
    const camera = { view: { scale: 1, offset_x: 0, offset_y: 0 }, rotation: 90 * DEG };
    close(to_screen(camera, { x: 10, y: 0 }), { x: 0, y: 10 });
  });

  test("within 8° of a quarter turn it settles square", () => {
    expect(snap_rotation(5 * DEG)).toBe(0);
    expect(snap_rotation(-7 * DEG) + 0).toBe(0);
    expect(snap_rotation(84 * DEG)).toBeCloseTo(90 * DEG);
    expect(snap_rotation(185 * DEG)).toBeCloseTo(180 * DEG);
    expect(snap_rotation(30 * DEG)).toBeCloseTo(30 * DEG);
    expect(snap_rotation(350 * DEG)).toBeCloseTo(-10 * DEG);
  });

  test("a two-finger twist turns, the spread zooms, and the point under the fingers stays under them", () => {
    const a = { x: 100, y: 100 };
    const b = { x: 200, y: 100 };
    const start = pinch_start(CAMERA, a, b);
    const under = to_sketch(CAMERA, start.mid);
    const twisted = pinch_camera(start, { x: 150, y: 50 }, { x: 150, y: 250 });
    expect(twisted.rotation).toBeCloseTo(90 * DEG);
    expect(twisted.view.scale).toBeCloseTo(4);
    close(to_screen(twisted, under), { x: 150, y: 150 });
  });

  test("a pinch that barely twists only zooms", () => {
    const start = pinch_start(CAMERA, { x: 0, y: 0 }, { x: 100, y: 0 });
    const zoomed = pinch_camera(start, { x: -10, y: 4 }, { x: 110, y: -4 });
    expect(zoomed.rotation).toBe(0);
  });

  test("turning back keeps the middle of the screen on the same spot", () => {
    const camera = { ...CAMERA, rotation: 40 * DEG };
    const middle = { x: 200, y: 300 };
    const spot = to_sketch(camera, middle);
    const upright = turn_camera(camera, 0, middle);
    expect(upright.rotation).toBe(0);
    close(to_screen(upright, spot), middle);
  });
});
