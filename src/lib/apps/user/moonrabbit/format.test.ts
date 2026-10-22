import { describe, expect, it } from "vitest";
import { break_line, format_lines, LineKind, Mark, type Segment } from "./format";
import { media_token, title_of } from "./journal";

const A = "a".repeat(32);

function text_of(segments: Segment[]): string {
  return segments.map((segment) => ("text" in segment ? segment.text : media_token(segment.media))).join("");
}

describe("format_lines", () => {
  it("keeps every character, so the shown text is the stored text", () => {
    const body = `# Title\n- a **bold** _it_ #tag\n1. *x*\n${media_token(A)} after\nplain`;
    expect(format_lines(body).map((line) => text_of(line.segments)).join("\n")).toBe(body);
  });

  it("recognises headings, lists, bold, italic and tags", () => {
    const [h2, list, text] = format_lines("## Morning\n- walk with **Ana**\nfelt *calm* #good");
    expect(h2.kind).toBe(LineKind.H2);
    expect(h2.segments[0]).toEqual({ text: "## ", marks: [Mark.MARK] });
    expect(list.kind).toBe(LineKind.LIST);
    expect(list.segments[0]).toEqual({ text: "- ", marks: [Mark.BULLET] });
    expect(list.segments).toContainEqual({ text: "Ana", marks: [Mark.BOLD] });
    expect(text.segments).toContainEqual({ text: "calm", marks: [Mark.ITALIC] });
    expect(text.segments).toContainEqual({ text: "#good", marks: [Mark.TAG] });
  });

  it("leaves unclosed markers, snake_case and a lone # as plain text", () => {
    for (const line of ["**open", "snake_case_name", "# ", "#", "2 * 3 * 4"]) {
      const [formatted] = format_lines(line);
      expect(formatted.segments.every((segment) => "text" in segment && !segment.marks.includes(Mark.BOLD) && !segment.marks.includes(Mark.ITALIC)), line).toBe(true);
    }
  });

  it("keeps a photo token whole inside other text", () => {
    const [line] = format_lines(`see ${media_token(A)} **ok**`);
    expect(line.segments[1]).toEqual({ media: A });
  });
});

describe("titles", () => {
  it("drop bold and italic markers but keep snake_case", () => {
    expect(title_of("## A **good** and *slow* _day_ in snake_case")).toBe("A good and slow day in snake_case");
  });
});

describe("break_line", () => {
  it("continues bullets and numbers, and ends a list on an empty item", () => {
    expect(break_line("- one", 5, 5)).toEqual({ body: "- one\n- ", caret: 8 });
    expect(break_line("  9. nine", 9, 9)).toEqual({ body: "  9. nine\n  10. ", caret: 16 });
    expect(break_line("- one\n- ", 8, 8)).toEqual({ body: "- one\n", caret: 6 });
  });

  it("is a plain newline elsewhere, for Shift+Enter and over a selection", () => {
    expect(break_line("hello", 2, 2)).toEqual({ body: "he\nllo", caret: 3 });
    expect(break_line("- one", 5, 5, false)).toEqual({ body: "- one\n", caret: 6 });
    expect(break_line("- one", 2, 5)).toEqual({ body: "- \n", caret: 3 });
  });
});
