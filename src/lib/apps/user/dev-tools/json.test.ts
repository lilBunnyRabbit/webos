import { describe, expect, test } from "vitest";
import { JsonIndent, format_json, minify_json, offset_to_position } from "./json";

describe("format_json / minify_json", () => {
  const input = '{ "a": [1, 2], "b": { "c": "č" } }';

  test("formats with the chosen indent", () => {
    expect(format_json(input, JsonIndent.TWO)).toEqual({
      ok: true,
      value: '{\n  "a": [\n    1,\n    2\n  ],\n  "b": {\n    "c": "č"\n  }\n}',
    });
    expect(format_json("[1]", JsonIndent.FOUR)).toEqual({ ok: true, value: "[\n    1\n]" });
    expect(format_json("[1]", JsonIndent.TAB)).toEqual({ ok: true, value: "[\n\t1\n]" });
  });

  test("minifies", () => {
    expect(minify_json(input)).toEqual({ ok: true, value: '{"a":[1,2],"b":{"c":"č"}}' });
  });

  test("reports the error position as line and column", () => {
    const result = minify_json('{\n  "a": 1,\n}');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.position).toEqual({ offset: 12, line: 3, column: 1 });
    expect(result.error).not.toMatch(/line \d+ column/);
  });

  test("points at the end for truncated input", () => {
    const result = format_json('{"a": [1, 2', JsonIndent.TWO);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.position?.offset).toBe(11);
  });
});

describe("offset_to_position", () => {
  test("counts lines and columns from 1", () => {
    expect(offset_to_position("ab\ncd", 0)).toEqual({ offset: 0, line: 1, column: 1 });
    expect(offset_to_position("ab\ncd", 4)).toEqual({ offset: 4, line: 2, column: 2 });
  });
});
