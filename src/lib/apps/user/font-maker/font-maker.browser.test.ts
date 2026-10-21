import { expect, test } from "vitest";
import { split_collection } from "$lib/core/utils/font-collection";
import { build_family, build_font, build_variable, place_glyph } from "./build";
import { CharSet } from "./charsets";
import { add_stroke, create_project, DEFAULT_METRICS, glyph_of, set_weights, type Stroke } from "./model";
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

function family_project() {
  let project = create_project("Family Hand");
  project = add_stroke(project, "o", line(100, 0, 100, 480));
  project = add_stroke(project, "o", line(100, 480, 400, 480));
  return set_weights(project, [
    { weight: 300, scale: 0.6 },
    { weight: 400, scale: 1 },
    { weight: 700, scale: 1.7 },
  ]);
}

async function width_of(family: string, weight: number, style = "normal"): Promise<number> {
  const context = new OffscreenCanvas(10, 10).getContext("2d")!;
  context.font = `${style} ${weight} 100px "${family}"`;
  await document.fonts.load(context.font, "o");
  return context.measureText("o").width;
}

test("a collection loads only its first face, so each split face is registered with its weight and style", async () => {
  const project = family_project();
  const ttc = build_family(project);
  const faces: FontFace[] = [new FontFace("fm-direct", ttc)];
  split_collection(ttc).forEach((bytes, index) => faces.push(new FontFace("fm-split", bytes, { weight: String([300, 400, 700][index % 3]), style: index >= 3 ? "italic" : "normal" })));
  await Promise.all(faces.map((face) => face.load()));
  faces.forEach((face) => document.fonts.add(face));
  try {
    const light = await width_of("fm-split", 300);
    expect(await width_of("fm-direct", 700)).toBeCloseTo(light, 1);
    const regular = await width_of("fm-split", 400);
    const bold = await width_of("fm-split", 700);
    expect(regular).toBeGreaterThan(light);
    expect(bold).toBeGreaterThan(regular);
    expect(await width_of("fm-split", 400, "italic")).toBeCloseTo(regular, 1);
  } finally {
    faces.forEach((face) => document.fonts.delete(face));
  }
});

test("the variable font interpolates between weights", async () => {
  const project = family_project();
  const face = new FontFace("fm-variable", build_variable(project), { weight: "300 700" });
  await face.load();
  document.fonts.add(face);
  try {
    const widths = await Promise.all([300, 400, 550, 700].map((weight) => width_of("fm-variable", weight)));
    expect(widths[0]).toBeLessThan(widths[1]);
    expect(widths[1]).toBeLessThan(widths[2]);
    expect(widths[2]).toBeLessThan(widths[3]);
  } finally {
    document.fonts.delete(face);
  }
});

