import { describe, expect, test } from "vitest";
import { add_box, translate } from "./edit";
import { fill } from "./faces";
import { create_wire } from "./model";
import { clip_text, extract_part, parse_clip, place_part } from "./part";

function box_with_face() {
  const box = add_box(create_wire(), null, { x: 100, y: 50, z: 200 }, "accent");
  const points = new Map(box.wire.points.map((point) => [point.id, point]));
  const front = box.wire.lines.filter((line) => points.get(line.a)!.y === 0 && points.get(line.b)!.y === 0);
  const done = fill(
    box.wire,
    front.map((line) => line.id)
  );
  if ("refused" in done) throw new Error(done.refused);
  return done.wire;
}

describe("placing parts", () => {
  test("copy and paste goes through the clipboard text, and a part dropped on its neighbour shares the corners", () => {
    const wire = box_with_face();
    const part = extract_part(
      wire,
      [],
      wire.lines.map((line) => line.id),
      []
    );
    const pasted = parse_clip(clip_text(part, wire.unit)!);
    expect(pasted?.faces).toHaveLength(1);
    const placed = place_part(wire, pasted!, { x: 100, y: 0, z: 0 });
    expect(placed.wire.points).toHaveLength(12);
    expect(placed.wire.lines).toHaveLength(20);
    expect(placed.wire.faces).toHaveLength(2);
    expect(parse_clip("hello")).toBeNull();
    expect(parse_clip(JSON.stringify({ version: 2, unit: "cm", points: [], lines: [], faces: [] }))).toBeNull();
  });

  test("a part of edges round a face doesn't carry it", () => {
    const wire = box_with_face();
    const [face] = wire.faces;
    const uprights = wire.lines.filter((line) => {
      const [a, b] = [line.a, line.b].map((id) => wire.points.find((point) => point.id === id)!);
      return a.z !== b.z;
    });
    expect(extract_part(wire, [], uprights.map((line) => line.id), []).faces).toHaveLength(0);
    expect(extract_part(wire, [], [], [face.id]).faces).toHaveLength(1);
  });

  test("a moved part merges into the points it lands on", () => {
    const wire = box_with_face();
    const placed = place_part(wire, extract_part(wire, [], wire.lines.map((line) => line.id), []), { x: 300, y: 0, z: 0 });
    const moved = translate(
      placed.wire,
      placed.wire.points.filter((point) => point.x >= 300).map((point) => point.id),
      { x: -200, y: 0, z: 0 }
    );
    expect(moved.points).toHaveLength(12);
    expect(moved.lines).toHaveLength(20);
    expect(moved.faces).toHaveLength(2);
  });
});
