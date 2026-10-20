import { expect, test } from "vitest";
import { build_font, place_glyph } from "./build";
import { CharSet } from "./charsets";
import { add_stroke, create_project, DEFAULT_METRICS, glyph_of, type Stroke } from "./model";
import { find_marks } from "./scan";
import { load_scan, scan_guides } from "./scan-image";
import { draw_template, PAGE, PNG_DPI, template_layout } from "./template";

const line = (x0: number, y0: number, x1: number, y1: number): Stroke =>
  Array.from({ length: 11 }, (_, index) => [x0 + ((x1 - x0) * index) / 10, y0 + ((y1 - y0) * index) / 10, 0.5]);

test("the browser loads the exported font and spaces glyphs by their advance", async () => {
  let project = create_project("Browser Hand");
  project = add_stroke(project, "A", line(100, 0, 300, 700));
  project = add_stroke(project, "A", line(300, 700, 500, 0));
  const bytes = build_font(project);
  const face = new FontFace("font-maker-test", bytes);
  await face.load();
  expect(face.status).toBe("loaded");
  document.fonts.add(face);
  try {
    const context = new OffscreenCanvas(10, 10).getContext("2d")!;
    context.font = "100px font-maker-test";
    const advance = place_glyph(glyph_of(project, "A"), project.metrics.bearing)!.advance;
    expect(context.measureText("A").width).toBeCloseTo(advance / 10, 0);
    expect(context.measureText("AA").width).toBeCloseTo((advance * 2) / 10, 0);
  } finally {
    document.fonts.delete(face);
  }
});

test("a filled-in template scans back into guides for the written boxes", async () => {
  const layout = template_layout(CharSet.BASIC_LATIN);
  const scale = PNG_DPI / 25.4;
  const canvas = new OffscreenCanvas(Math.round(PAGE.width * scale), Math.round(PAGE.height * scale));
  const context = canvas.getContext("2d")!;
  draw_template(context, layout, DEFAULT_METRICS, "Test");
  const box = layout.boxes.find((item) => item.char === "B")!;
  context.strokeStyle = "#111";
  context.lineWidth = 6;
  context.beginPath();
  context.moveTo((box.x + 4) * scale, (box.y + 4) * scale);
  context.lineTo((box.x + box.width - 4) * scale, (box.y + box.height - 6) * scale);
  context.stroke();
  const scan = await load_scan(await canvas.convertToBlob({ type: "image/png" }));
  try {
    const marks = find_marks(scan.gray);
    expect(marks).not.toBeNull();
    const guides = await scan_guides(scan.gray, marks!, CharSet.BASIC_LATIN);
    expect([...guides.keys()]).toEqual(["B"]);
    expect(guides.get("B")).toMatch(/^data:image\/webp;base64,/);
    expect(guides.get("B")!.length).toBeLessThan(12_000);
  } finally {
    URL.revokeObjectURL(scan.url);
  }
});
