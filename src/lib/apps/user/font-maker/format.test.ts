import { describe, expect, test } from "vitest";
import { CharSet } from "./charsets";
import { parse_project, serialize_project } from "./format";
import {
  add_stroke,
  clear_guides,
  clear_strokes,
  create_project,
  face_strokes,
  fallback_layer,
  is_redrawn,
  layer_strokes,
  regular_weight,
  reset_layer,
  reset_spacing,
  set_auto_kerning,
  set_guides,
  set_kern_adjustment,
  kern_adjustment,
  set_slant,
  set_stroke_width,
  set_weights,
  STROKE_WIDTH,
  stroke_width,
  update_glyph,
  type Layer,
  type Stroke,
} from "./model";

describe("format", () => {
  test("round-trips a project and rounds stroke points", () => {
    let project = add_stroke(create_project("Hand"), "A", [
      [10.123, 20.987, 0.5555],
      [30, 40, 1],
    ]);
    project = { ...project, sets: [CharSet.BASIC_LATIN, CharSet.SYMBOLS] };
    const parsed = parse_project(serialize_project(project));
    expect(parsed.name).toBe("Hand");
    expect(parsed.sets).toEqual([CharSet.BASIC_LATIN, CharSet.SYMBOLS]);
    expect(parsed.glyphs.A.strokes[0][0]).toEqual([10.1, 21, 0.56]);
  });

  test("refuses a newer version, non-JSON and bad shapes", () => {
    expect(() => parse_project("nope")).toThrow(/isn't JSON/);
    expect(() => parse_project(JSON.stringify({ ...create_project(), version: 4 }))).toThrow(/newer Font Maker/);
    expect(() => parse_project(JSON.stringify({ ...create_project(), sets: ["klingon"] }))).toThrow(/sets/);
    expect(() => parse_project(JSON.stringify({ ...create_project(), glyphs: { AB: { strokes: [] } } }))).toThrow(/glyphs\.AB/);
    const project = create_project();
    expect(() => parse_project(JSON.stringify({ ...project, metrics: { ...project.metrics, x: 900, cap: 700 } }))).toThrow(/x-height/);
  });

  test("stroke width is optional, kept and range-checked", () => {
    const plain = parse_project(serialize_project(create_project()));
    expect(plain.stroke).toBeUndefined();
    expect(stroke_width(plain)).toBe(STROKE_WIDTH);
    const wide = set_stroke_width(create_project(), 120);
    expect(parse_project(serialize_project(wide)).stroke).toEqual({ width: 120 });
    expect(set_stroke_width(wide, 120)).toBe(wide);
    expect(stroke_width(set_stroke_width(wide, 999))).toBe(160);
    expect(() => parse_project(JSON.stringify({ ...create_project(), stroke: { width: 5 } }))).toThrow(/stroke\.width/);
  });

  test("reset spacing drops both nudges and keeps the strokes", () => {
    const nudged = update_glyph(add_stroke(create_project(), "A", [[0, 0, 0.5]]), "A", (glyph) => ({ ...glyph, lsb: 20, rsb: -10 }));
    const reset = reset_spacing(nudged, "A");
    expect(reset.glyphs.A).toEqual({ strokes: [[[0, 0, 0.5]]] });
    expect(reset_spacing(reset, "A")).toBe(reset);
  });

  test("a version 1 file opens with the default weights and italic", () => {
    const { weights: _weights, italic: _italic, ...v1 } = { ...create_project("Old"), version: 1 };
    const parsed = parse_project(JSON.stringify(v1));
    expect(parsed.version).toBe(3);
    expect(parsed.weights).toEqual([
      { weight: 400, scale: 1 },
      { weight: 700, scale: 1.7 },
    ]);
    expect(parsed.italic).toEqual({ slant: 10 });
  });

  test("weights, italic and per-face redraws round-trip; bad weights are refused", () => {
    const dot: Stroke = [[1.234, 2, 0.5]];
    let project = set_slant(set_weights(create_project(), [{ weight: 700, scale: 1.6 }, { weight: 300, scale: 0.6 }, { weight: 400, scale: 1 }]), null);
    project = add_stroke(project, "a", dot);
    project = add_stroke(project, "a", dot, { kind: "weight", weight: 700 });
    project = add_stroke(project, "a", dot, { kind: "italic" });
    const parsed = parse_project(serialize_project(project));
    expect(parsed.weights.map((item) => item.weight)).toEqual([300, 400, 700]);
    expect(parsed.italic).toBeNull();
    expect(parsed.glyphs.a.weights?.["700"]).toHaveLength(2);
    expect(parsed.glyphs.a.weights?.["700"][0][0]).toEqual([1.2, 2, 0.5]);
    expect(parsed.glyphs.a.italic).toHaveLength(2);
    expect(() => parse_project(JSON.stringify({ ...create_project(), weights: [{ weight: 450, scale: 1 }] }))).toThrow(/weights/);
    expect(() => parse_project(JSON.stringify({ ...create_project(), weights: [] }))).toThrow(/weights/);
  });

  test("a redraw starts from the regular strokes, and resetting it falls back to them", () => {
    const bold: Layer = { kind: "weight", weight: 700 };
    let project = add_stroke(create_project(), "o", [[0, 0, 0.5]]);
    project = add_stroke(project, "o", [[5, 5, 0.5]], bold);
    expect(layer_strokes(project.glyphs.o, bold)).toHaveLength(2);
    expect(project.glyphs.o.strokes).toHaveLength(1);
    expect(face_strokes(project.glyphs.o, { weight: 700, italic: false })).toHaveLength(2);
    expect(face_strokes(project.glyphs.o, { weight: 400, italic: true })).toHaveLength(1);
    const cleared = clear_strokes(project, "o", bold);
    expect(cleared.glyphs.o.weights?.["700"]).toEqual([]);
    expect(reset_layer(cleared, "o", bold).glyphs.o.weights).toBeUndefined();
    expect(regular_weight(set_weights(create_project(), [{ weight: 300, scale: 0.6 }, { weight: 500, scale: 1.2 }]))).toBe(300);
  });

  test("a version 2 file opens, keeps its redraws and saves as version 3", () => {
    const dot: Stroke = [[1, 2, 0.5]];
    const v2 = { ...add_stroke(add_stroke(create_project(), "a", dot), "a", dot, { kind: "italic" }), version: 2 };
    const parsed = parse_project(JSON.stringify(v2));
    expect(parsed.glyphs.a.italic).toHaveLength(2);
    expect(JSON.parse(serialize_project(parsed)).version).toBe(3);
  });

  test("an italic redraw per weight wins over the shared italic, which wins over the weight's redraw", () => {
    const at = (x: number): Stroke => [[x, 0, 0.5]];
    const bold_italic: Layer = { kind: "italic", weight: 700 };
    let project = add_stroke(create_project(), "a", at(1));
    project = add_stroke(project, "a", at(2), { kind: "weight", weight: 700 });
    expect(layer_strokes(project.glyphs.a, bold_italic)).toEqual([at(1), at(2)]);
    expect(fallback_layer(project.glyphs.a, bold_italic)).toEqual({ kind: "weight", weight: 700 });
    project = add_stroke(project, "a", at(3), { kind: "italic" });
    expect(face_strokes(project.glyphs.a, { weight: 700, italic: true })).toEqual([at(1), at(3)]);
    expect(fallback_layer(project.glyphs.a, bold_italic)).toEqual({ kind: "italic" });
    expect(is_redrawn(project.glyphs.a, bold_italic)).toBe(false);

    project = add_stroke(project, "a", at(4), bold_italic);
    expect(project.glyphs.a.italics?.["700"]).toEqual([at(1), at(3), at(4)]);
    expect(face_strokes(project.glyphs.a, { weight: 700, italic: true })).toEqual([at(1), at(3), at(4)]);
    expect(face_strokes(project.glyphs.a, { weight: 400, italic: true })).toEqual([at(1), at(3)]);
    expect(face_strokes(project.glyphs.a, { weight: 700, italic: false })).toEqual([at(1), at(2)]);

    const parsed = parse_project(serialize_project(project));
    expect(parsed.glyphs.a.italics).toEqual({ "700": [at(1), at(3), at(4)] });
    expect(() => parse_project(JSON.stringify({ ...project, glyphs: { a: { strokes: [], italics: { "750": [] } } } }))).toThrow(/italics/);

    const cleared = clear_strokes(project, "a", bold_italic);
    expect(cleared.glyphs.a.italics).toEqual({ "700": [] });
    expect(face_strokes(cleared.glyphs.a, { weight: 700, italic: true })).toEqual([]);
    const reset = reset_layer(project, "a", bold_italic);
    expect(reset.glyphs.a.italics).toBeUndefined();
    expect(reset.glyphs.a.italic).toEqual([at(1), at(3)]);
    expect(reset_layer(reset, "a", bold_italic)).toBe(reset);
  });

  test("guides are kept and cleared", () => {
    const guided = set_guides(create_project(), new Map([["a", "data:image/webp;base64,AAAA"]]));
    expect(parse_project(serialize_project(guided)).glyphs.a.guide).toBe("data:image/webp;base64,AAAA");
    expect(clear_guides(guided).glyphs).toEqual({});
  });

  test("kerning: new projects kern automatically, older files don't, pairs round-trip and are checked", () => {
    expect(create_project().kerning).toEqual({ auto: true });
    const { kerning: _kerning, ...old } = { ...create_project(), version: 2 };
    expect(parse_project(JSON.stringify(old)).kerning).toBeUndefined();
    let project = set_kern_adjustment(create_project(), "AV", -30);
    project = set_kern_adjustment(project, "To", 999);
    expect(project.kerning).toEqual({ auto: true, pairs: { AV: -30, To: 400 } });
    expect(kern_adjustment(project, "AV")).toBe(-30);
    expect(set_kern_adjustment(project, "AV", -30)).toBe(project);
    expect(parse_project(serialize_project(project)).kerning).toEqual({ auto: true, pairs: { AV: -30, To: 400 } });
    project = set_kern_adjustment(set_kern_adjustment(project, "AV", 0), "To", 0);
    expect(project.kerning).toEqual({ auto: true });
    expect(set_auto_kerning(project, false).kerning).toEqual({ auto: false });
    expect(set_kern_adjustment({ ...create_project(), kerning: undefined }, "AV", 10).kerning).toEqual({ auto: false, pairs: { AV: 10 } });
    expect(() => parse_project(JSON.stringify({ ...create_project(), kerning: { auto: true, pairs: { ABC: 10 } } }))).toThrow(/kerning/);
    expect(() => parse_project(JSON.stringify({ ...create_project(), kerning: { auto: true, pairs: { AV: 1.5 } } }))).toThrow(/kerning/);
  });
});
