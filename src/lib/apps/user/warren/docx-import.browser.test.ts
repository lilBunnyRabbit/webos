import { describe, expect, it } from "vitest";
import { build_docx } from "./docx";
import { word_like_docx } from "./docx-fixture";
import { docx_to_html, left_out } from "./docx-import";
import { WarrenEditor } from "./editor.svelte";
import { SAMPLE, SAMPLE_V3 } from "./fixture";
import { blocks_of, document_text } from "./model";

function editor_from(html: string) {
  const editor = new WarrenEditor((error) => {
    throw error;
  });
  editor.load_html(html);
  return editor;
}

describe("docx import", () => {
  it("reads format 3 exports back: strikethrough, sub- and superscript, check glyphs", async () => {
    const { html, left_out: dropped } = await docx_to_html(await (await build_docx(SAMPLE_V3, "Plan")).arrayBuffer());
    expect(html).toContain("H<sub>2</sub>O and E=mc<sup>2</sup><s> old</s>");
    expect(html).toContain("☑ Pack");
    expect(dropped).toEqual([]);
    const editor = editor_from(html);
    expect(document_text(editor.json)).toBe("Plan\nH2O and E=mc2 old\n☑ Pack\n☐ Go");
  });

  it("reads Warren's own .docx back as headings, runs and lists", async () => {
    const { html, left_out: dropped } = await docx_to_html(await (await build_docx(SAMPLE, "CV")).arrayBuffer());
    expect(html).toContain("<h1>Jane &amp; Co &lt;CV&gt;</h1>");
    expect(html).toContain("<strong>very</strong>");
    expect(dropped).toEqual([]);

    const editor = editor_from(html);
    expect(document_text(editor.json)).toBe("Jane & Co <CV>\nA fast learner, very fast\nBreakfast fan.\nOne\nNested\nTwo\nDot");
    expect(blocks_of(editor.json).map((block) => block.kind)).toEqual(["heading", "paragraph", "item", "item", "item", "item"]);
    expect(editor.dirty).toBe(false);
    editor.destroy();
  });

  it("reads a Word-shaped file, keeps its picture and says what it left out", async () => {
    const { html, left_out: dropped } = await docx_to_html(await word_like_docx());
    expect(html).toContain("<h1>Jane Doe</h1><h1>Experience</h1>");
    expect(html).toContain("Led a <strong>small</strong> team, <em>on time</em> and <u>on budget</u>.");
    expect(html).toContain("<ul><li>Shipped the app</li><li>Hired three people</li></ul>");
    expect(html).toContain(`<a href="https://example.com/jane">my site</a>`);
    expect(dropped).toEqual(["1 table (the text is kept)"]);

    const editor = editor_from(html);
    const blocks = blocks_of(editor.json);
    expect(blocks.map((block) => block.kind)).toEqual(["heading", "heading", "paragraph", "item", "item", "paragraph", "image", "paragraph", "paragraph", "page-break", "heading"]);
    const runs = blocks[2].kind === "paragraph" ? blocks[2].runs : [];
    expect(runs.map((run) => [run.text, run.bold, run.italic, run.underline])).toEqual([
      ["Led a ", false, false, false],
      ["small", true, false, false],
      [" team, ", false, false, false],
      ["on time", false, true, false],
      [" and ", false, false, false],
      ["on budget", false, false, true],
      [".", false, false, false],
    ]);
    expect(document_text(editor.json)).toContain("Skill\nLevel");
    editor.destroy();
  });

  it("names what was left out", () => {
    expect(left_out("<p>x</p>", 0, 0)).toEqual([]);
    expect(left_out("<table><tr></tr></table><table>", 2, 3)).toEqual(["2 pictures", "2 tables (the text is kept)", "3 unsupported styles"]);
  });
});
