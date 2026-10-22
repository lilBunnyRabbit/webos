import { describe, expect, it } from "vitest";
import { PIXEL, SAMPLE, SAMPLE_V3, SAMPLE_V4, SAMPLE_V5 } from "./fixture";
import type { DocNode, EditorJson } from "./format";
import { inline, is_markdown, to_markdown } from "./markdown";
import type { Run } from "./model";
import { filter_slash, SlashCommand } from "./slash";

const run = (text: string, extra: Partial<Run> = {}): Run => ({ text, bold: false, italic: false, underline: false, strike: false, script: null, size: null, link: null, color: null, highlight: null, ...extra });
const doc = (...children: DocNode[]): EditorJson => ({ root: { type: "root", children } });

describe("markdown export", () => {
  it("writes headings, runs, a hard line break, links, nested lists and a page break", () => {
    expect(to_markdown(SAMPLE.editor)).toBe(
      ["# Jane & Co <CV>", "", "A fast learner, **very** *fast*\\", "Breakfast [fan](https://example.com/?a=1&b=2).", "", "1. One", "    - Nested", "2. Two", "", "<!-- page break -->", "", "- Dot", ""].join("\n")
    );
  });

  it("writes check lists, a rule and drops what Markdown has no way to say", () => {
    expect(to_markdown(SAMPLE_V3.editor)).toBe(["## Plan", "", "H2O and E=mc2 ~~old~~", "", "---", "", "- [x] Pack", "- [ ] Go", ""].join("\n"));
  });

  it("writes a title as a heading, a quote, and tables as GFM, an empty header for a table without one", () => {
    expect(to_markdown(SAMPLE_V5.editor)).toBe(
      [
        "# Jane Doe",
        "",
        "> Make it simple.",
        "",
        "Red and **marked**",
        "",
        "| Skill | Level | Years |",
        "| --- | --- | --- |",
        "| Writing | **Expert** |  |",
        "|  | Good | - Five |",
        "",
        "| | |",
        "| --- | --- |",
        "| Left | Right |",
        "",
      ].join("\n")
    );
  });

  it("keeps pictures inside as data URLs", () => {
    expect(to_markdown(SAMPLE_V4.editor)).toContain(`![Logo](${PIXEL})`);
  });

  it("puts spaces outside the markers and escapes markup characters", () => {
    expect(inline([run("A "), run(" bold ", { bold: true }), run("and"), run(" both", { bold: true, italic: true })])).toBe("A  **bold** and ***both***");
    expect(inline([run("2 * 3 = [6]_ok_")])).toBe("2 \\* 3 = \\[6\\]\\_ok\\_");
    expect(inline([run("see "), run("this", { link: "https://a.b/(x)" })])).toBe("see [this](https://a.b/%28x%29)");
  });

  it("escapes a paragraph that would read as a heading, list or quote", () => {
    const paragraph = (value: string) => ({ type: "paragraph", children: [{ type: "text", text: value }] });
    expect(to_markdown(doc(paragraph("# not a heading"), paragraph("- not a list"), paragraph("1. not a number"), paragraph("> not a quote")))).toBe(
      ["\\# not a heading", "", "\\- not a list", "", "\\1. not a number", "", "\\> not a quote", ""].join("\n")
    );
  });

  it("writes nothing for an empty document and knows Markdown file names", () => {
    expect(to_markdown(doc({ type: "paragraph", children: [] }))).toBe("");
    expect([is_markdown("/a/Notes.MD"), is_markdown("x.markdown"), is_markdown("x.warren")]).toEqual([true, true, false]);
  });
});

describe("slash menu", () => {
  const ids = (query: string) => filter_slash(query).map((item) => item.id);

  it("lists every block for a bare slash", () => {
    expect(ids("")).toHaveLength(14);
    expect(ids("")[0]).toBe(SlashCommand.TEXT);
  });

  it("puts label prefixes first, then words of the label, then keywords", () => {
    expect(ids("h")).toEqual([SlashCommand.H1, SlashCommand.H2, SlashCommand.H3, SlashCommand.RULE]);
    expect(ids("lis")).toEqual([SlashCommand.BULLETS, SlashCommand.NUMBERS, SlashCommand.CHECKLIST]);
    expect(ids("ture")).toEqual([SlashCommand.PICTURE]);
    expect(ids("head")).toEqual([SlashCommand.H1, SlashCommand.H2, SlashCommand.H3]);
    expect(ids("2")).toEqual([SlashCommand.H2]);
    expect(ids("list")).toEqual([SlashCommand.BULLETS, SlashCommand.NUMBERS, SlashCommand.CHECKLIST]);
    expect(ids("break")).toEqual([SlashCommand.PAGE_BREAK]);
    expect(ids("TODO")).toEqual([SlashCommand.CHECKLIST]);
    expect(ids("image")).toEqual([SlashCommand.PICTURE]);
  });

  it("finds nothing for a word no block has", () => {
    expect(ids("zebra")).toEqual([]);
  });
});
