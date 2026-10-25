import { describe, expect, test } from "vitest";
import { add_box, add_dim, add_marker, add_note, add_point, append_point, start_path } from "./edit";
import { parse_sketch, serialize_sketch } from "./format";
import { create_sketch, Unit } from "./model";

function sample() {
  let sketch = create_sketch(Unit.M);
  const a = add_point(sketch, { x: 0, y: 0 });
  const b = add_point(a.sketch, { x: 100.04, y: 0 });
  const path = start_path(b.sketch, a.id);
  sketch = append_point(path.sketch, path.id, b.id, 2450);
  sketch = add_dim(sketch, a.id, b.id, -20).sketch;
  sketch = add_marker(sketch, b.id, "Socket").sketch;
  sketch = add_note(sketch, { x: 5, y: 5 }, "Kitchen").sketch;
  return add_box(sketch, { x: 50, y: 50 }).sketch;
}

describe("format", () => {
  test("round-trips a sketch", () => {
    const sketch = sample();
    const parsed = parse_sketch(serialize_sketch(sketch));
    expect(parsed.unit).toBe(Unit.M);
    expect(parsed.paths[0].lengths).toEqual([2450]);
    expect(parsed.points[1].x).toBe(100);
    expect(parsed.markers[0].note).toBe("Socket");
    expect(parsed.boxes[0]).toMatchObject({ w: null, d: null, h: null });
  });

  test("refuses broken files with a reason", () => {
    expect(() => parse_sketch("nope")).toThrow(/isn't JSON/);
    expect(() => parse_sketch(JSON.stringify({ version: 2 }))).toThrow(/newer Tape Sketch/);
    expect(() => parse_sketch(JSON.stringify({ ...create_sketch(), unit: "ft" }))).toThrow(/unit/);
  });

  test("refuses a path whose lengths don't match its edges", () => {
    const sketch = sample();
    const broken = { ...sketch, paths: [{ ...sketch.paths[0], lengths: [] }] };
    expect(() => parse_sketch(JSON.stringify(broken))).toThrow(/0 lengths for 1 edges/);
  });

  test("refuses a reference to a missing corner", () => {
    const sketch = sample();
    const broken = { ...sketch, markers: [{ id: "m", point: "ghost", note: "" }] };
    expect(() => parse_sketch(JSON.stringify(broken))).toThrow(/doesn't exist/);
  });
});
