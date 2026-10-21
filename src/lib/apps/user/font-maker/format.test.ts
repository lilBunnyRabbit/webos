import { describe, expect, test } from "vitest";
import { CharSet } from "./charsets";
import { parse_project, serialize_project } from "./format";
import { add_stroke, clear_guides, create_project, reset_spacing, set_guides, set_stroke_width, STROKE_WIDTH, stroke_width, update_glyph } from "./model";

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
    expect(() => parse_project(JSON.stringify({ ...create_project(), version: 2 }))).toThrow(/newer Font Maker/);
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

  test("guides are kept and cleared", () => {
    const guided = set_guides(create_project(), new Map([["a", "data:image/webp;base64,AAAA"]]));
    expect(parse_project(serialize_project(guided)).glyphs.a.guide).toBe("data:image/webp;base64,AAAA");
    expect(clear_guides(guided).glyphs).toEqual({});
  });
});
