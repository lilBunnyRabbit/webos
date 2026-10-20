import { describe, expect, test } from "vitest";
import { CharSet } from "./charsets";
import { parse_project, serialize_project } from "./format";
import { add_stroke, clear_guides, create_project, set_guides } from "./model";

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

  test("guides are kept and cleared", () => {
    const guided = set_guides(create_project(), new Map([["a", "data:image/webp;base64,AAAA"]]));
    expect(parse_project(serialize_project(guided)).glyphs.a.guide).toBe("data:image/webp;base64,AAAA");
    expect(clear_guides(guided).glyphs).toEqual({});
  });
});
