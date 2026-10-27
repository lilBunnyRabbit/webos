import { describe, expect, test } from "vitest";
import {
  add_dim,
  add_marker,
  add_point,
  append_point,
  close_path,
  delete_path,
  delete_point,
  finish_path,
  length_of,
  measure_targets,
  redraw_to_scale,
  set_check,
  set_length,
  set_snap,
  start_path,
  step_target,
  unmeasured_count,
  walk,
  FIRST_STEP,
} from "./edit";
import { DIRECTIONS, distance } from "./geometry";
import { create_sketch, type Sketch } from "./model";

const [, UP, , LEFT, RIGHT, , DOWN] = DIRECTIONS;

function square(lengths: (number | null)[] = [null, null, null, null]): {
  sketch: Sketch;
  path: string;
  corners: string[];
} {
  let sketch = create_sketch();
  const corners: string[] = [];
  for (const [x, y] of [
    [0, 0],
    [100, 0],
    [100, 100],
    [0, 100],
  ]) {
    const added = add_point(sketch, { x, y });
    sketch = added.sketch;
    corners.push(added.id);
  }
  const started = start_path(sketch, corners[0]);
  sketch = started.sketch;
  for (let i = 1; i < 4; i++) sketch = append_point(sketch, started.id, corners[i], lengths[i - 1]);
  sketch = close_path(sketch, started.id, lengths[3]);
  return { sketch, path: started.id, corners };
}

describe("paths", () => {
  test("tapping corners builds a closed path with one length per edge", () => {
    const { sketch } = square();
    expect(sketch.paths[0].closed).toBe(true);
    expect(sketch.paths[0].lengths).toEqual([null, null, null, null]);
  });

  test("a path finished with one corner disappears with its corner", () => {
    let sketch = create_sketch();
    const point = add_point(sketch, { x: 0, y: 0 });
    const path = start_path(point.sketch, point.id);
    sketch = finish_path(path.sketch, path.id);
    expect(sketch.paths).toEqual([]);
    expect(sketch.points).toEqual([]);
  });

  test("deleting a corner merges its two edges into one unmeasured edge", () => {
    const { sketch, corners } = square([1, 2, 3, 4]);
    const after = delete_point(sketch, corners[2]);
    expect(after.paths[0].points).toEqual([corners[0], corners[1], corners[3]]);
    expect(after.paths[0].lengths).toEqual([1, null, 4]);
  });

  test("deleting the first corner of a closed path keeps the lengths in order", () => {
    const { sketch, corners } = square([1, 2, 3, 4]);
    const after = delete_point(sketch, corners[0]);
    expect(after.paths[0].points).toEqual([corners[1], corners[2], corners[3]]);
    expect(after.paths[0].lengths).toEqual([2, 3, null]);
  });

  test("deleting a path drops its corners but keeps one a marker hangs on", () => {
    const { sketch, path, corners } = square();
    const marked = add_marker(sketch, corners[1], "Lamp").sketch;
    const after = delete_path(marked, path);
    expect(after.points.map((point) => point.id)).toEqual([corners[1]]);
  });
});

describe("targets", () => {
  test("lists each path's edges, then dimensions", () => {
    let { sketch, corners } = square();
    sketch = add_dim(sketch, corners[0], corners[2], 10).sketch;
    expect(measure_targets(sketch).map((target) => target.kind)).toEqual(["edge", "edge", "edge", "edge", "dim"]);
    expect(unmeasured_count(sketch)).toBe(5);
  });

  test("← and → step through what's still unmeasured", () => {
    const { sketch, path } = square([1000, null, 1000, null]);
    const first = step_target(sketch, null, 1)!;
    expect(first).toEqual({ kind: "edge", path, index: 1 });
    expect(step_target(sketch, first, 1)).toEqual({ kind: "edge", path, index: 3 });
    expect(step_target(sketch, first, -1)).toEqual({ kind: "edge", path, index: 3 });
  });

  test("with everything measured they step through all of it", () => {
    const { sketch, path } = square([1, 2, 3, 4]);
    expect(step_target(sketch, { kind: "edge", path, index: 3 }, 1)).toEqual({ kind: "edge", path, index: 0 });
    expect(step_target(sketch, { kind: "edge", path, index: 0 }, -1)).toEqual({ kind: "edge", path, index: 3 });
  });

  test("set_length writes the right slot", () => {
    let { sketch, path } = square();
    sketch = set_length(sketch, { kind: "edge", path, index: 2 }, 2450);
    expect(length_of(sketch, { kind: "edge", path, index: 2 })).toBe(2450);
    expect(sketch.paths[0].lengths[3]).toBeNull();
  });
});

describe("settings on the sketch", () => {
  test("a new path checks its lengths; turning it off is one edit, and a no-op isn't", () => {
    const { sketch, path } = square();
    expect(sketch.paths[0].check).toBe(true);
    const off = set_check(sketch, path, false);
    expect(off.paths[0].check).toBe(false);
    expect(set_check(off, path, false)).toBe(off);
  });

  test("the magnet set is stored normalised, and the same set isn't a change", () => {
    const sketch = create_sketch();
    expect(sketch.snap).toEqual([0, 45, 90, 135]);
    const iso = set_snap(sketch, [150, 30, 270, 0]);
    expect(iso.snap).toEqual([0, 30, 90, 150]);
    expect(set_snap(iso, [0, 30, 90, 150])).toBe(iso);
    expect(set_snap(iso, [])).toBe(iso);
  });
});

describe("walk", () => {
  test("the first step sets the scale, the next ones follow it", () => {
    const start = add_point(create_sketch(), { x: 0, y: 0 });
    const one = walk(start.sketch, start.id, RIGHT, 500);
    const end = one.sketch.points.find((point) => point.id === one.point)!;
    expect(end.x).toBeCloseTo(FIRST_STEP);
    const two = walk(one.sketch, one.point, DOWN, 250);
    const corner = two.sketch.points.find((point) => point.id === two.point)!;
    expect(corner.y).toBeCloseTo(FIRST_STEP / 2);
    expect(two.sketch.paths).toHaveLength(1);
    expect(two.sketch.paths[0].lengths).toEqual([500, 250]);
  });

  test("walking back onto the first corner closes the path", () => {
    const start = add_point(create_sketch(), { x: 0, y: 0 });
    let step = walk(start.sketch, start.id, RIGHT, 500);
    step = walk(step.sketch, step.point, DOWN, 300);
    step = walk(step.sketch, step.point, LEFT, 500);
    step = walk(step.sketch, step.point, UP, 300);
    expect(step.closed).toBe(true);
    expect(step.point).toBe(start.id);
    expect(step.sketch.paths[0].lengths).toEqual([500, 300, 500, 300]);
    expect(step.sketch.points).toHaveLength(4);
  });

  test("walking from the start of an open path extends it the other way", () => {
    const start = add_point(create_sketch(), { x: 0, y: 0 });
    const step = walk(start.sketch, start.id, RIGHT, 500);
    const back = walk(step.sketch, start.id, UP, 200);
    expect(back.sketch.paths).toHaveLength(1);
    expect(back.sketch.paths[0].lengths).toEqual([500, 200]);
  });
});

test("redraw to scale is one edit that moves the corners to the lengths", () => {
  const { sketch, path, corners } = square([4000, 2000, 4000, 2000]);
  const after = redraw_to_scale(sketch, path);
  const at = (id: string) => after.points.find((point) => point.id === id)!;
  expect(distance(at(corners[0]), at(corners[1])) / distance(at(corners[1]), at(corners[2]))).toBeCloseTo(2);
  expect(sketch.points.find((point) => point.id === corners[2])).toMatchObject({ x: 100, y: 100 });
});
