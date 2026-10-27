import { describe, expect, test } from "vitest";
import { add_dim, add_point, append_point, close_path, set_length, start_path } from "./edit";
import { line_hits_rect, rects_overlap } from "./labels";
import { create_sketch, type Sketch } from "./model";
import { build_scene } from "./scene";

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
  return add_dim(sketch, ids[0], ids[2], 30).sketch;
}

describe("build_scene", () => {
  const scene = build_scene(room(), VIEW);
  const lines = [...scene.edges, ...scene.dims.flatMap((dim) => [{ a: dim.a, b: dim.b }, ...dim.extensions])];

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

  test("turned, the lines turn and the labels are placed upright off them", () => {
    const turned = build_scene(room(), VIEW, Math.PI / 6);
    const edge = turned.edges[0];
    expect(Math.atan2(edge.b.y - edge.a.y, edge.b.x - edge.a.x)).toBeCloseTo(Math.PI / 6);
    const turned_lines = [...turned.edges, ...turned.dims.flatMap((dim) => [{ a: dim.a, b: dim.b }, ...dim.extensions])];
    for (const label of turned.labels) {
      expect(label.rect.h).toBe(20);
      for (const line of turned_lines) expect(line_hits_rect(line, label.rect)).toBe(false);
    }
  });
});
