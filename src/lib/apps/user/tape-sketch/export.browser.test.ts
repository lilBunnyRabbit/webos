import { describe, expect, it } from "vitest";
import { add_point, append_point, close_path, set_length, start_path } from "./edit";
import { sketch_svg, svg_to_png, theme_palette } from "./export";
import { create_sketch, type Sketch } from "./model";

function room(): Sketch {
  let sketch = create_sketch();
  const ids: string[] = [];
  for (const [x, y] of [
    [0, 0],
    [200, 0],
    [200, 150],
    [0, 150],
  ]) {
    const added = add_point(sketch, { x, y });
    sketch = added.sketch;
    ids.push(added.id);
  }
  const path = start_path(sketch, ids[0]);
  sketch = path.sketch;
  for (const id of ids.slice(1)) sketch = append_point(sketch, path.id, id);
  sketch = close_path(sketch, path.id);
  return set_length(sketch, { kind: "edge", path: path.id, index: 0 }, 4000);
}

describe("export", () => {
  it("resolves theme colours to plain hex", () => {
    document.documentElement.style.setProperty("--foreground", "oklch(0.9 0 0)");
    const palette = theme_palette();
    expect(palette.ink).toMatch(/^#[0-9a-f]{6}$/);
    expect(palette.muted).toMatch(/^#[0-9a-f]{8}$/);
  });

  it("writes an SVG that parses, with the lengths on it", () => {
    const svg = sketch_svg(room())!;
    const parsed = new DOMParser().parseFromString(svg, "image/svg+xml");
    expect(parsed.querySelector("parsererror")).toBeNull();
    expect(svg).toContain("400 cm");
    expect(svg).not.toContain("oklch");
  });

  it("renders the SVG to a PNG at twice its size", async () => {
    const svg = sketch_svg(room())!;
    const blob = await svg_to_png(svg);
    expect(blob.type).toBe("image/png");
    const bitmap = await createImageBitmap(blob);
    const width = Number(/width="(\d+)"/.exec(svg)![1]);
    expect(bitmap.width).toBe(width * 2);
  });

  it("has nothing to export from an empty sketch", () => {
    expect(sketch_svg(create_sketch())).toBeNull();
  });
});
