import { describe, expect, test } from "vitest";
import { add_dim, add_marker, add_note, add_point, append_point, set_length, start_path } from "./edit";
import { parse_sketch, serialize_sketch } from "./format";
import { create_sketch, Unit } from "./model";

function sample() {
  let sketch = create_sketch(Unit.M);
  const a = add_point(sketch, { x: 0, y: 0 });
  const b = add_point(a.sketch, { x: 100.04, y: 0 });
  const path = start_path(b.sketch, a.id);
  sketch = append_point(path.sketch, path.id, b.id, 2450);
  sketch = set_length(sketch, { kind: "height", path: path.id }, 1200);
  sketch = add_dim(sketch, a.id, b.id, -20).sketch;
  sketch = add_marker(sketch, b.id, "Socket").sketch;
  return add_note(sketch, { x: 5, y: 5 }, "Kitchen").sketch;
}

describe("format", () => {
  test("round-trips a sketch", () => {
    const { sketch, dropped_boxes } = parse_sketch(serialize_sketch(sample()));
    expect(sketch.version).toBe(2);
    expect(sketch.unit).toBe(Unit.M);
    expect(sketch.paths[0].lengths).toEqual([2450]);
    expect(sketch.paths[0].height).toBe(1200);
    expect(sketch.points[1].x).toBe(100);
    expect(sketch.markers[0].note).toBe("Socket");
    expect(dropped_boxes).toBe(0);
    expect(serialize_sketch(sketch)).not.toContain("boxes");
  });

  test("opens a version 1 file: no heights, its boxes left out and counted", () => {
    const v1 = {
      version: 1,
      unit: "cm",
      points: [
        { id: "a", x: 0, y: 0 },
        { id: "b", x: 10, y: 0 },
      ],
      paths: [{ id: "p", points: ["a", "b"], closed: false, lengths: [1000] }],
      dims: [],
      markers: [],
      notes: [],
      boxes: [
        { id: "x", x: 0, y: 0, w: 600, d: null, h: 900, note: "" },
        { id: "y", x: 5, y: 5, w: null, d: null, h: null, note: "Wardrobe" },
      ],
    };
    const { sketch, dropped_boxes } = parse_sketch(JSON.stringify(v1));
    expect(dropped_boxes).toBe(2);
    expect(sketch.version).toBe(2);
    expect(sketch.paths[0]).toMatchObject({ lengths: [1000], height: null });
    expect("boxes" in sketch).toBe(false);
  });

  test("refuses broken files with a reason", () => {
    expect(() => parse_sketch("nope")).toThrow(/isn't JSON/);
    expect(() => parse_sketch(JSON.stringify({ version: 3 }))).toThrow(/newer Tape Sketch/);
    expect(() => parse_sketch(JSON.stringify({ ...create_sketch(), unit: "ft" }))).toThrow(/unit/);
    const sketch = sample();
    const no_height = { ...sketch, paths: sketch.paths.map(({ height: _, ...rest }) => rest) };
    expect(() => parse_sketch(JSON.stringify(no_height))).toThrow(/height/);
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
