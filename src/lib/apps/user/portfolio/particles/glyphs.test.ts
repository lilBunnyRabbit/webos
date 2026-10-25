import { describe, expect, test } from "vitest";
import { PRINCIPLES } from "../content/principles";
import { PRINCIPLE_GLYPHS, shape_for } from "./glyphs";
import { ShapeKind } from "./shapes";

describe("shape_for", () => {
  test("no principle open is the logo", () => {
    expect(shape_for(null)).toEqual({ kind: ShapeKind.LOGO });
  });

  test("every principle has its own glyph", () => {
    const kinds = PRINCIPLES.map((principle) => shape_for(principle.id).kind);
    expect(kinds).not.toContain(ShapeKind.LOGO);
    expect(new Set(kinds).size).toBe(PRINCIPLES.length);
  });

  test("glyphs only name principles that exist", () => {
    const ids = PRINCIPLES.map((principle) => principle.id);
    expect(Object.keys(PRINCIPLE_GLYPHS).every((id) => ids.includes(id))).toBe(true);
  });

  test("an unknown id falls back to the logo", () => {
    expect(shape_for("nope")).toEqual({ kind: ShapeKind.LOGO });
  });
});
