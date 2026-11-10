import { describe, expect, test } from "vitest";
import {
  axis_directions,
  basis,
  nearest_axis,
  orbit_by,
  overlapping,
  preset_of,
  PRESETS,
  projector,
  repivot,
  ViewPreset,
  type Camera,
} from "./projection";

const camera = (preset: ViewPreset): Camera => ({
  orbit: PRESETS[preset],
  pivot: { x: 0, y: 0, z: 0 },
  view: { scale: 1, offset_x: 0, offset_y: 0 },
});

describe("projection", () => {
  test("cavalier draws X across, Z up and Y at 30° full length, like the Inkscape sketches", () => {
    const { project } = projector(camera(ViewPreset.CAVALIER));
    expect(project({ x: 100, y: 0, z: 0 })).toMatchObject({ x: 100, y: 0 });
    expect(project({ x: 0, y: 0, z: 100 })).toMatchObject({ x: 0, y: -100 });
    const y = project({ x: 0, y: 4000, z: 0 });
    expect(y.x).toBeCloseTo(3464.1, 1);
    expect(y.y).toBeCloseTo(-2000, 6);
  });

  test("isometric draws all three axes at the same length", () => {
    const { direction } = projector(camera(ViewPreset.ISOMETRIC));
    const lengths = [
      direction({ x: 1, y: 0, z: 0 }),
      direction({ x: 0, y: 1, z: 0 }),
      direction({ x: 0, y: 0, z: 1 }),
    ].map((v) => Math.hypot(v.x, v.y));
    expect(lengths[1]).toBeCloseTo(lengths[0], 9);
    expect(lengths[2]).toBeCloseTo(lengths[0], 9);
  });

  test("depth grows toward the viewer: in front, the nearer Y is nearer", () => {
    const { project } = projector(camera(ViewPreset.FRONT));
    expect(project({ x: 0, y: 0, z: 0 }).depth).toBeGreaterThan(project({ x: 0, y: 100, z: 0 }).depth);
    const top = projector(camera(ViewPreset.TOP)).project;
    expect(top({ x: 0, y: 0, z: 100 }).depth).toBeGreaterThan(top({ x: 0, y: 0, z: 0 }).depth);
  });

  test("moving the pivot leaves the picture where it was", () => {
    const before = camera(ViewPreset.ISOMETRIC);
    const after = repivot(before, { x: 120, y: -40, z: 33 });
    const p = { x: 10, y: 20, z: 30 };
    expect(projector(after).project(p).x).toBeCloseTo(projector(before).project(p).x, 9);
    expect(projector(after).project(p).y).toBeCloseTo(projector(before).project(p).y, 9);
  });

  test("orbiting out of cavalier fades the shear and leaves the preset", () => {
    const turned = orbit_by(PRESETS[ViewPreset.CAVALIER], 80, 0);
    expect(turned.oblique).toBeLessThan(1);
    expect(preset_of(turned)).toBeNull();
    expect(preset_of(PRESETS[ViewPreset.TOP])).toBe(ViewPreset.TOP);
  });
});

describe("axis inference", () => {
  test("a drag picks the axis and sign whose screen direction is nearest", () => {
    const directions = axis_directions(basis(PRESETS[ViewPreset.CAVALIER]));
    expect(nearest_axis(directions, { x: 50, y: 3 })).toMatchObject({ axis: "x", sign: 1 });
    expect(nearest_axis(directions, { x: 2, y: 60 })).toMatchObject({ axis: "z", sign: -1 });
    expect(nearest_axis(directions, { x: -40, y: 25 })).toMatchObject({ axis: "y", sign: -1 });
  });

  test("an axis seen end-on isn't offered, and the rest still draw", () => {
    const directions = axis_directions(basis(PRESETS[ViewPreset.FRONT]));
    expect(directions.map((each) => each.axis).sort()).toEqual(["x", "x", "z", "z"]);
    expect(overlapping(directions)).toBeNull();
  });

  test("two axes lying on one screen line are refused", () => {
    const directions = axis_directions(basis({ yaw: 0.05, pitch: 0.05, oblique: 0 }));
    expect(overlapping(directions)).toBeNull();
    const squeezed = axis_directions(basis({ yaw: Math.PI / 4, pitch: 0.06, oblique: 0 }));
    expect(overlapping(squeezed)).not.toBeNull();
  });
});
