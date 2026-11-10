import { describe, expect, test } from "vitest";
import { add_box, delete_items, merge_coincident, move_points, walk } from "./edit";
import { fill, FillRefusal } from "./faces";
import { create_wire, type Wire } from "./model";
import { PRESETS, ViewPreset } from "./projection";
import { build_scene } from "./scene";

function square(): Wire {
  let wire = create_wire();
  let from: string | null = null;
  for (const [axis, sign] of [
    ["x", 1],
    ["z", 1],
    ["x", -1],
    ["z", -1],
  ] as const) {
    const step = walk(wire, from, axis, sign, 100, sign > 0 ? "accent" : null);
    wire = step.wire;
    from = step.point;
  }
  return wire;
}

const all_lines = (wire: Wire) => wire.lines.map((line) => line.id);

describe("faces", () => {
  test("a closed flat loop fills, in loop order, with its edges' most common colour", () => {
    const wire = square();
    const done = fill(wire, all_lines(wire));
    if ("refused" in done) throw new Error(done.refused);
    expect(done.wire.faces).toHaveLength(1);
    expect(done.wire.faces[0].points).toHaveLength(4);
    expect(done.wire.faces[0].color).toBe("accent");
    expect(fill(done.wire, all_lines(wire))).toEqual({ refused: FillRefusal.FILLED });
  });

  test("refuses an open chain and a bent loop", () => {
    const wire = square();
    expect(fill(wire, all_lines(wire).slice(0, 3))).toEqual({ refused: FillRefusal.NO_LOOP });
    const bent = move_points(wire, [wire.points[2].id], "y", 50);
    expect(fill(bent, all_lines(bent))).toEqual({ refused: FillRefusal.NOT_FLAT });
  });

  test("deleting a side drops the face; merging keeps it", () => {
    const wire = square();
    const done = fill(wire, all_lines(wire));
    if ("refused" in done) throw new Error(done.refused);
    expect(delete_items(done.wire, [], [wire.lines[0].id]).faces).toHaveLength(0);
    const [face] = done.wire.faces;
    const twin = { ...done.wire.points.find((point) => point.id === face.points[0])!, id: "twin" };
    const copy: Wire = {
      ...done.wire,
      points: [...done.wire.points, twin],
      faces: [face, { ...face, id: "f2", points: ["twin", ...face.points.slice(1)] }],
    };
    const merged = merge_coincident(copy).wire;
    expect(merged.faces).toHaveLength(1);
    expect(merged.points.some((point) => point.id === "twin")).toBe(false);
  });

  test("a face draws before its own edges, which keep their labels", () => {
    const box = add_box(create_wire(), null, { x: 800, y: 400, z: 2000 }, null);
    const points = new Map(box.wire.points.map((point) => [point.id, point]));
    const front = box.wire.lines.filter((line) => points.get(line.a)!.y === 0 && points.get(line.b)!.y === 0);
    const done = fill(
      box.wire,
      front.map((line) => line.id)
    );
    if ("refused" in done) throw new Error(done.refused);
    const camera = { orbit: PRESETS[ViewPreset.FRONT], pivot: { x: 0, y: 0, z: 0 }, view: { scale: 0.2, offset_x: 300, offset_y: 500 } };
    const scene = build_scene(done.wire, camera);
    const at = (id: string) => scene.order.findIndex((item) => item.id === id);
    for (const line of front) expect(at(line.id)).toBeGreaterThan(at(done.id));
    const labelled = new Set(scene.labels.map((label) => label.id));
    expect(front.some((line) => labelled.has(line.id))).toBe(true);
  });
});
