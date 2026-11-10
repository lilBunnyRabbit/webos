import { describe, expect, test } from "vitest";
import { add_box, copy_along, delete_items, extrude, merge_coincident, move_points, walk } from "./edit";
import { axis_of, create_wire, point_map, type Wire } from "./model";

function rectangle(): { wire: Wire; corners: string[] } {
  let wire = create_wire();
  const corners: string[] = [];
  let from: string | null = null;
  for (const [axis, sign, length] of [
    ["x", 1, 800],
    ["y", 1, 400],
    ["x", -1, 800],
    ["y", -1, 400],
  ] as const) {
    const step = walk(wire, from, axis, sign, length, null);
    wire = step.wire;
    from = step.point;
    corners.push(step.point);
  }
  return { wire, corners };
}

describe("axis walk", () => {
  test("starts at the origin and ends on the point the lengths lead back to", () => {
    const { wire, corners } = rectangle();
    expect(wire.points).toHaveLength(4);
    expect(wire.lines).toHaveLength(4);
    expect(corners[3]).toBe(wire.points[0].id);
    expect(wire.points[0]).toMatchObject({ x: 0, y: 0, z: 0 });
  });

  test("a moved point turns its lines into slopes", () => {
    const { wire, corners } = rectangle();
    const moved = move_points(wire, [corners[1]], "z", 200);
    const points = point_map(moved);
    const axes = moved.lines.map((line) => axis_of(points.get(line.a)!, points.get(line.b)!));
    expect(axes.filter((axis) => axis === null)).toHaveLength(2);
  });

  test("deleting a line drops ends nothing else holds", () => {
    const step = walk(create_wire(), null, "x", 1, 100, null);
    const cleared = delete_items(step.wire, [], [step.wire.lines[0].id]);
    expect(cleared.points).toHaveLength(0);
  });
});

describe("repeat tools", () => {
  test("a box is 8 corners and 12 edges", () => {
    const box = add_box(create_wire(), null, { x: 800, y: 400, z: 2000 }, "primary");
    expect(box.wire.points).toHaveLength(8);
    expect(box.lines).toHaveLength(12);
    const points = point_map(box.wire);
    expect(box.wire.lines.every((line) => axis_of(points.get(line.a)!, points.get(line.b)!) !== null)).toBe(true);
  });

  test("extrude copies the lines and joins each copied corner to its original", () => {
    const { wire } = rectangle();
    const done = extrude(
      wire,
      wire.lines.map((line) => line.id),
      "z",
      2000
    );
    expect(done.wire.points).toHaveLength(8);
    expect(done.wire.lines).toHaveLength(12);
    expect(done.lines).toHaveLength(8);
  });

  test("copy along an axis makes count copies a step apart", () => {
    const post = walk(create_wire(), null, "z", 1, 1000, null);
    const done = copy_along(post.wire, [post.wire.lines[0].id], "x", 1500, 3);
    expect(done.wire.lines).toHaveLength(4);
    expect(Math.max(...done.wire.points.map((point) => point.x))).toBe(4500);
  });

  test("merge joins points in one place and drops the lines that collapse", () => {
    const wire: Wire = {
      version: 1,
      unit: "cm",
      points: [
        { id: "a", x: 0, y: 0, z: 0 },
        { id: "b", x: 100, y: 0, z: 0 },
        { id: "c", x: 100, y: 0, z: 0 },
      ],
      lines: [
        { id: "1", a: "a", b: "b", color: null },
        { id: "2", a: "a", b: "c", color: null },
        { id: "3", a: "b", b: "c", color: null },
      ],
    };
    const merged = merge_coincident(wire);
    expect(merged.merged).toBe(1);
    expect(merged.wire.points).toHaveLength(2);
    expect(merged.wire.lines).toHaveLength(1);
  });
});
