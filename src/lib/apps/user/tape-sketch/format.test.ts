import { describe, expect, test } from "vitest";
import { add_dim, add_marker, add_note, add_point, append_point, set_check, set_snap, start_path } from "./edit";
import { parse_sketch, serialize_sketch } from "./format";
import { create_sketch, Unit } from "./model";

function sample() {
  let sketch = create_sketch(Unit.M);
  const a = add_point(sketch, { x: 0, y: 0 });
  const b = add_point(a.sketch, { x: 100.04, y: 0 });
  const path = start_path(b.sketch, a.id);
  sketch = append_point(path.sketch, path.id, b.id, 2450);
  sketch = set_check(sketch, path.id, false);
  sketch = set_snap(sketch, [0, 30, 90, 150]);
  sketch = add_dim(sketch, a.id, b.id, -20).sketch;
  sketch = add_marker(sketch, b.id, "Socket").sketch;
  return add_note(sketch, { x: 5, y: 5 }, "Kitchen").sketch;
}

function v2(paths: unknown[], markers: unknown[] = []) {
  return {
    version: 2,
    unit: "cm",
    points: [
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 10, y: 0 },
      { id: "c", x: 10, y: 10 },
    ],
    paths,
    dims: [],
    markers,
    notes: [],
  };
}

describe("format", () => {
  test("round-trips a sketch", () => {
    const { sketch, dropped_boxes, moved_heights } = parse_sketch(serialize_sketch(sample()));
    expect(sketch.version).toBe(3);
    expect(sketch.unit).toBe(Unit.M);
    expect(sketch.snap).toEqual([0, 30, 90, 150]);
    expect(sketch.paths[0].lengths).toEqual([2450]);
    expect(sketch.paths[0].check).toBe(false);
    expect(sketch.points[1].x).toBe(100);
    expect(sketch.markers[0].note).toBe("Socket");
    expect(dropped_boxes).toBe(0);
    expect(moved_heights).toBe(0);
    expect(serialize_sketch(sketch)).not.toContain("height");
  });

  test("opens a version 2 file: each height becomes a note on the path's first corner", () => {
    const file = v2(
      [
        { id: "p", points: ["a", "b"], closed: false, lengths: [1000], height: 2500 },
        { id: "q", points: ["b", "c"], closed: false, lengths: [null], height: 900 },
        { id: "r", points: ["c", "a"], closed: false, lengths: [null], height: null },
      ],
      [{ id: "m", point: "b", note: "Socket" }]
    );
    const { sketch, moved_heights } = parse_sketch(JSON.stringify(file));
    expect(moved_heights).toBe(2);
    expect(sketch.version).toBe(3);
    expect(sketch.snap).toEqual([0, 45, 90, 135]);
    expect(sketch.paths.every((path) => path.check && !("height" in path))).toBe(true);
    expect(sketch.markers).toHaveLength(2);
    expect(sketch.markers.find((marker) => marker.point === "a")!.note).toBe("↑ 250 cm");
    expect(sketch.markers.find((marker) => marker.point === "b")).toEqual({ id: "m", point: "b", note: "Socket · ↑ 90 cm" });
  });

  test("two heights on one corner land on the same marker", () => {
    const file = v2([
      { id: "p", points: ["a", "b"], closed: false, lengths: [null], height: 1000 },
      { id: "q", points: ["a", "c"], closed: false, lengths: [null], height: 2000 },
    ]);
    const { sketch } = parse_sketch(JSON.stringify(file));
    expect(sketch.markers).toHaveLength(1);
    expect(sketch.markers[0].note).toBe("↑ 100 cm · ↑ 200 cm");
  });

  test("opens a version 1 file: its boxes left out and counted", () => {
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
    const { sketch, dropped_boxes, moved_heights } = parse_sketch(JSON.stringify(v1));
    expect(dropped_boxes).toBe(2);
    expect(moved_heights).toBe(0);
    expect(sketch.version).toBe(3);
    expect(sketch.paths[0]).toMatchObject({ lengths: [1000], check: true });
    expect(sketch.markers).toEqual([]);
    expect("boxes" in sketch).toBe(false);
  });

  test("refuses broken files with a reason", () => {
    expect(() => parse_sketch("nope")).toThrow(/isn't JSON/);
    expect(() => parse_sketch(JSON.stringify({ version: 4 }))).toThrow(/newer Tape Sketch/);
    expect(() => parse_sketch(JSON.stringify({ ...create_sketch(), unit: "ft" }))).toThrow(/unit/);
    expect(() => parse_sketch(JSON.stringify({ ...create_sketch(), snap: [] }))).toThrow(/snap/);
    const sketch = sample();
    const no_check = { ...sketch, paths: sketch.paths.map(({ check: _, ...rest }) => rest) };
    expect(() => parse_sketch(JSON.stringify(no_check))).toThrow(/check/);
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
