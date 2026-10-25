import { describe, expect, test } from "vitest";
import {
  back_to_front,
  clamp_pitch,
  MAX_PITCH,
  MIN_PITCH,
  nearest_line,
  orbit_by,
  preset_of,
  PRESETS,
  project,
  ViewPreset,
} from "./projection";

describe("project", () => {
  test("straight down at yaw 0 the floor reads as the 2D sketch, height doesn't move it", () => {
    const top = PRESETS[ViewPreset.TOP];
    const p = project(top, { x: 30, y: 40, z: 0 });
    expect(p.x).toBeCloseTo(30);
    expect(p.y).toBeCloseTo(40);
    const raised = project(top, { x: 30, y: 40, z: 500 });
    expect(raised.x).toBeCloseTo(30);
    expect(raised.y).toBeCloseTo(40);
    expect(raised.depth).toBeGreaterThan(p.depth);
  });

  test("from the front, up is up the screen and the bottom of the page is nearest", () => {
    const front = { yaw: 0, pitch: 0 };
    expect(project(front, { x: 0, y: 0, z: 100 }).y).toBeCloseTo(-100);
    expect(project(front, { x: 0, y: 50, z: 0 }).depth).toBeGreaterThan(project(front, { x: 0, y: -50, z: 0 }).depth);
  });

  test("turning keeps distances on the floor, from above", () => {
    const orbit = { yaw: 0.7, pitch: MAX_PITCH };
    const a = project(orbit, { x: 0, y: 0, z: 0 });
    const b = project(orbit, { x: 300, y: 400, z: 0 });
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(500);
  });

  test("a ¾ view shows a vertical edge shorter than its height and the floor foreshortened", () => {
    const orbit = PRESETS[ViewPreset.THREE_QUARTER];
    const foot = project(orbit, { x: 0, y: 0, z: 0 });
    const tip = project(orbit, { x: 0, y: 0, z: 100 });
    expect(tip.y).toBeLessThan(foot.y);
    expect(foot.y - tip.y).toBeLessThan(100);
  });
});

describe("orbit", () => {
  test("pitch stays between near-side and straight down", () => {
    expect(clamp_pitch(-1)).toBe(MIN_PITCH);
    expect(clamp_pitch(5)).toBe(MAX_PITCH);
    expect(orbit_by({ yaw: 0, pitch: 1 }, 0, 10_000).pitch).toBe(MAX_PITCH);
  });

  test("yaw goes all the way round", () => {
    let orbit = { yaw: 0, pitch: 0.5 };
    for (let i = 0; i < 40; i++) orbit = orbit_by(orbit, 100, 0);
    expect(Math.abs(orbit.yaw)).toBeLessThanOrEqual(Math.PI);
  });

  test("a preset is recognised, a turned view isn't", () => {
    expect(preset_of(PRESETS[ViewPreset.SIDE])).toBe(ViewPreset.SIDE);
    expect(preset_of(orbit_by(PRESETS[ViewPreset.SIDE], 5, 0))).toBeNull();
  });
});

test("back_to_front draws the farthest first", () => {
  const sorted = back_to_front([
    { id: "near", depth: 10 },
    { id: "far", depth: -5 },
    { id: "middle", depth: 0 },
  ]);
  expect(sorted.map((item) => item.id)).toEqual(["far", "middle", "near"]);
});

describe("nearest_line", () => {
  const lines = [
    { a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, value: "floor" },
    { a: { x: 0, y: 30 }, b: { x: 100, y: 30 }, value: "top" },
    { a: { x: 50, y: 14 }, b: { x: 52, y: 14 }, value: "end-on" },
  ];

  test("takes the nearest line within the radius", () => {
    expect(nearest_line(lines, { x: 20, y: 8 }, 22)).toBe("floor");
    expect(nearest_line(lines, { x: 20, y: 24 }, 22)).toBe("top");
  });

  test("misses beyond the radius", () => {
    expect(nearest_line(lines, { x: 20, y: 80 }, 22)).toBeNull();
  });

  test("a line seen end-on loses a near tie", () => {
    expect(nearest_line(lines, { x: 51, y: 9 }, 22)).toBe("floor");
    expect(nearest_line(lines, { x: 51, y: 14 }, 22)).toBe("end-on");
  });
});
