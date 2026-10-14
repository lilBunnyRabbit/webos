import { describe, expect, it } from "vitest";
import { compare, field_of, order_values, parse_literal, to_text } from "./values";

describe("parse_literal", () => {
  it("reads sizes as bytes and durations as a moment that long ago", () => {
    expect(parse_literal("1mb")).toBe(1024 ** 2);
    expect(parse_literal("1.5KB")).toBe(1536);
    expect(parse_literal("2d", 1_000_000_000)).toBe(1_000_000_000 - 2 * 86_400_000);
  });

  it("reads numbers, booleans and null; everything else stays text", () => {
    expect(parse_literal("42")).toBe(42);
    expect(parse_literal("true")).toBe(true);
    expect(parse_literal("null")).toBeNull();
    expect(parse_literal(".png")).toBe(".png");
    expect(parse_literal("3zz")).toBe("3zz");
  });
});

describe("compare", () => {
  it("compares numbers as numbers and text as text", () => {
    expect(compare(10, ">", 9)).toBe(true);
    expect(compare("10", "==", 10)).toBe(true);
    expect(compare("b", ">", "a")).toBe(true);
  });

  it("=~ is a case-insensitive contains", () => {
    expect(compare("Beach.PNG", "=~", ".png")).toBe(true);
    expect(compare("beach.jpg", "=~", ".png")).toBe(false);
  });

  it("orders only numbers against numbers", () => {
    expect(compare(null, ">", 5)).toBe(false);
    expect(compare("abc", "<", 5)).toBe(false);
  });

  it("a missing field only passes !=", () => {
    expect(compare(undefined, "==", 1)).toBe(false);
    expect(compare(undefined, "!=", 1)).toBe(true);
  });
});

describe("field_of", () => {
  it("digs through records and list indexes", () => {
    expect(field_of({ a: { b: [1, 2] } }, "a.b.1")).toBe(2);
    expect(field_of("text", "a")).toBeUndefined();
  });
});

describe("order_values", () => {
  it("sorts numbers numerically and missing values last", () => {
    expect([3, null, 1].sort(order_values)).toEqual([1, 3, null]);
    expect(["file10", "file2"].sort(order_values)).toEqual(["file2", "file10"]);
  });
});

describe("to_text", () => {
  it("uses the value type's text, records as key: value lines", () => {
    const types = (type: string) => (type === "file" ? { columns: [], text: () => "a file" } : undefined);
    expect(to_text({ $type: "file", path: "/a" }, types)).toBe("a file");
    expect(to_text({ a: 1, b: "x" }, types)).toBe("a: 1\nb: x");
    expect(to_text([1, "two"], types)).toBe("1\ntwo");
  });
});
