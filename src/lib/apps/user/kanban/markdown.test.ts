import { describe, expect, test } from "vitest";
import { parse_inline, parse_markdown } from "./markdown";

describe("parse_inline", () => {
  test("marks", () => {
    expect(parse_inline("a **b** *c* _d_ `e`")).toEqual([
      { kind: "text", text: "a " },
      { kind: "bold", text: "b" },
      { kind: "text", text: " " },
      { kind: "italic", text: "c" },
      { kind: "text", text: " " },
      { kind: "italic", text: "d" },
      { kind: "text", text: " " },
      { kind: "code", text: "e" },
    ]);
  });

  test("links, only http(s)", () => {
    expect(parse_inline("[docs](https://x.dev) and https://y.dev")).toEqual([
      { kind: "link", text: "docs", href: "https://x.dev" },
      { kind: "text", text: " and " },
      { kind: "link", text: "https://y.dev", href: "https://y.dev" },
    ]);
    expect(parse_inline("[x](javascript:alert(1))")).toEqual([{ kind: "text", text: "[x](javascript:alert(1))" }]);
  });

  test("html stays text", () => {
    expect(parse_inline("<b>hi</b>")).toEqual([{ kind: "text", text: "<b>hi</b>" }]);
  });

  test("a lone star is text", () => {
    expect(parse_inline("2 * 3 = 6")).toEqual([{ kind: "text", text: "2 * 3 = 6" }]);
  });
});

describe("parse_markdown", () => {
  test("headings, lists, paragraphs", () => {
    const blocks = parse_markdown("# Plan\n- one\n* two\n\nfirst line\nsecond line\n\nend");
    expect(blocks.map((block) => block.kind)).toEqual(["heading", "list", "paragraph", "paragraph"]);
    expect(blocks[1]).toEqual({ kind: "list", items: [[{ kind: "text", text: "one" }], [{ kind: "text", text: "two" }]] });
    expect(blocks[2]).toMatchObject({ kind: "paragraph", lines: [[{ text: "first line" }], [{ text: "second line" }]] });
  });

  test("empty input", () => {
    expect(parse_markdown("")).toEqual([]);
    expect(parse_markdown("\n\n")).toEqual([]);
  });
});
