import { describe, expect, test } from "vitest";
import { add_box, add_dim, add_point, append_point, close_path, set_length, start_path } from "./edit";
import { line_hits_rect, rects_overlap } from "./labels";
import { create_sketch, type Sketch } from "./model";
import { box_corners, build_scene } from "./scene";

const VIEW = { scale: 1, offset_x: 0, offset_y: 0 };

function room(): Sketch {
  let sketch = create_sketch();
  const ids: string[] = [];
  for (const [x, y] of [
    [100, 100],
    [400, 100],
    [400, 300],
    [250, 300],
    [250, 400],
    [100, 400],
  ]) {
    const added = add_point(sketch, { x, y });
    sketch = added.sketch;
    ids.push(added.id);
  }
  const path = start_path(sketch, ids[0]);
  sketch = path.sketch;
  for (const id of ids.slice(1)) sketch = append_point(sketch, path.id, id);
  sketch = close_path(sketch, path.id);
  sketch = set_length(sketch, { kind: "edge", path: path.id, index: 0 }, 4000);
  sketch = add_dim(sketch, ids[0], ids[2], 30).sketch;
  return add_box(sketch, { x: 500, y: 300 }).sketch;
}

describe("build_scene", () => {
  const scene = build_scene(room(), VIEW);
  const lines = [
    ...scene.edges,
    ...scene.dims.flatMap((dim) => [{ a: dim.a, b: dim.b }, ...dim.extensions]),
    ...scene.boxes.flatMap((box) => [...box.visible, ...box.hidden]),
  ];

  test("no label crosses a line", () => {
    for (const label of scene.labels) for (const line of lines) expect(line_hits_rect(line, label.rect)).toBe(false);
  });

  test("no two labels overlap", () => {
    for (const [i, a] of scene.labels.entries())
      for (const b of scene.labels.slice(i + 1)) expect(rects_overlap(a.rect, b.rect)).toBe(false);
  });

  test("edge lengths sit outside a closed path", () => {
    const top = scene.labels.find((label) => label.id.endsWith(":0") && label.id.startsWith("edge"))!;
    expect(top.text).toBe("400 cm");
    expect(top.rect.y + top.rect.h).toBeLessThanOrEqual(100);
    const inner = scene.labels.find((label) => label.id.endsWith(":2") && label.id.startsWith("edge"))!;
    expect(inner.rect.x).toBeGreaterThanOrEqual(250);
    expect(inner.rect.y).toBeGreaterThanOrEqual(300);
  });

  test("unmeasured lengths read as a question", () => {
    expect(scene.labels.filter((label) => !label.measured && label.target?.kind === "edge")).toHaveLength(5);
  });

  test("a box shows W, D and H", () => {
    expect(scene.labels.filter((label) => label.target?.kind === "box").map((label) => label.text)).toEqual([
      "W ?",
      "D ?",
      "H ?",
    ]);
  });
});

test("box corners: a measured box keeps its proportions, depth recedes up and right", () => {
  const corners = box_corners({ id: "b", x: 0, y: 0, w: 2000, d: 1000, h: 1000, note: "" });
  expect(corners[1].x).toBe(120);
  expect(corners[3].y).toBe(-60);
  expect(corners[4].x).toBeGreaterThan(0);
  expect(corners[4].y).toBeLessThan(0);
});
