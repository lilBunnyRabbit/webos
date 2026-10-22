import { describe, expect, test } from "vitest";
import { $createParagraphNode, $getRoot, $getSelection, $isRangeSelection, KEY_ARROW_DOWN_COMMAND, KEY_ENTER_COMMAND, KEY_ESCAPE_COMMAND, type LexicalEditor } from "lexical";
import { WarrenEditor } from "./editor.svelte";
import { PIXEL, SAMPLE, SAMPLE_V5 } from "./fixture";
import { serialize_document } from "./format";
import { to_markdown } from "./markdown";
import { draw_marks } from "./marks";
import { blocks_of, document_text } from "./model";
import { SlashCommand } from "./slash";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function mounted(on_command: (command: SlashCommand) => void = () => {}) {
  const editor = new WarrenEditor(
    (error) => {
      throw error;
    },
    () => true,
    {},
    on_command
  );
  const root = document.createElement("div");
  root.contentEditable = "true";
  document.body.append(root);
  const stop = editor.mount(root);
  editor.reset();
  return { editor, root, dispose: () => (stop(), root.remove(), editor.destroy()) };
}

function type(lexical: LexicalEditor, text: string) {
  for (const character of text) {
    lexical.update(
      () => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) selection.insertText(character);
      },
      { discrete: true }
    );
  }
}

const key = (name: string) => new KeyboardEvent("keydown", { key: name, cancelable: true });

const ROUND_TRIP = [
  "# Plan",
  "",
  "Some **bold**, *italic* and ~~gone~~ text with a [link](https://example.com).\\",
  "A second line.",
  "",
  "## Steps",
  "",
  "1. One",
  "2. Two",
  "    - Nested",
  "",
  "- [x] Done",
  "- [ ] Next",
  "",
  "> A quote",
  "",
  "---",
  "",
  "<!-- page break -->",
  "",
  `![Dot](${PIXEL})`,
  "",
  "| Name | Role |",
  "| --- | --- |",
  "| Jane | **Lead** |",
  "",
  "| | |",
  "| --- | --- |",
  "| Left | Right |",
  "",
].join("\n");

describe("markdown in the editor", () => {
  test("Markdown → Warren → Markdown gives the same text back", async () => {
    const { editor, dispose } = mounted();
    expect(editor.load_markdown(ROUND_TRIP)).toBe(0);
    await tick();
    const kinds = blocks_of(editor.json).map((block) => block.kind);
    expect(kinds).toEqual(["heading", "paragraph", "heading", "item", "item", "item", "item", "item", "quote", "rule", "page-break", "image", "table", "table", "paragraph"]);
    expect(editor.dirty).toBe(false);
    expect(to_markdown(editor.snapshot().editor)).toBe(ROUND_TRIP);
    dispose();
  });

  test("Warren → Markdown → Warren keeps the blocks Markdown can hold", async () => {
    const { editor, dispose } = mounted();
    const markdown = to_markdown(SAMPLE_V5.editor);
    editor.load_markdown(markdown);
    await tick();
    expect(to_markdown(editor.snapshot().editor)).toBe(markdown);
    expect(document_text(editor.json)).toContain("Make it simple.");
    dispose();
  });

  test("reads real-world Markdown: wrapped lines, deep headings, web pictures, CRLF", async () => {
    const { editor, dispose } = mounted();
    const left = editor.load_markdown("#### Deep\r\n\r\nOne line\r\nwrapped here.\r\n\r\n![Logo](https://example.com/logo.png)\r\n");
    await tick();
    expect(left).toBe(1);
    const blocks = blocks_of(editor.json);
    expect(blocks[0]).toMatchObject({ kind: "heading", level: 3 });
    expect(blocks[1]).toMatchObject({ kind: "paragraph", runs: [{ text: "One line wrapped here." }] });
    expect(blocks[2]).toMatchObject({ kind: "paragraph", runs: [{ text: "Logo", link: "https://example.com/logo.png" }] });
    dispose();
  });

  test("typing # and a space makes a heading, --- and a space a rule, **…** bold", async () => {
    const { editor, dispose } = mounted();
    editor.focus();
    type(editor.lexical, "## Title");
    await tick();
    expect(blocks_of(editor.json)[0]).toMatchObject({ kind: "heading", level: 2, runs: [{ text: "Title" }] });
    editor.lexical.update(
      () => {
        const paragraph = $createParagraphNode();
        $getRoot().append(paragraph);
        paragraph.select();
      },
      { discrete: true }
    );
    type(editor.lexical, "--- ");
    await tick();
    expect(blocks_of(editor.json).some((block) => block.kind === "rule")).toBe(true);
    type(editor.lexical, "a **b** ");
    await tick();
    const runs = blocks_of(editor.json).flatMap((block) => ("runs" in block ? block.runs : []));
    expect(runs.find((item) => item.text === "b")).toMatchObject({ bold: true });
    dispose();
  });
});

describe("slash menu", () => {
  test("opens on a typed slash, filters, steps with the arrows and runs the pick", async () => {
    const picked: SlashCommand[] = [];
    const { editor, dispose } = mounted((command) => picked.push(command));
    editor.focus();
    type(editor.lexical, "Hello /he");
    await tick();
    expect(editor.slash?.query).toBe("he");
    expect(editor.slash_items.map((item) => item.id)).toEqual([SlashCommand.H1, SlashCommand.H2, SlashCommand.H3]);
    expect(editor.lexical.dispatchCommand(KEY_ARROW_DOWN_COMMAND, key("ArrowDown"))).toBe(true);
    expect(editor.slash_index).toBe(1);
    editor.lexical.dispatchCommand(KEY_ENTER_COMMAND, key("Enter"));
    await tick();
    expect(picked).toEqual([SlashCommand.H2]);
    expect(editor.slash).toBeNull();
    expect(document_text(editor.json)).toBe("Hello ");
    dispose();
  });

  test("doesn't open mid-word, and Escape closes it leaving the slash", async () => {
    const { editor, dispose } = mounted();
    editor.focus();
    type(editor.lexical, "and/or");
    await tick();
    expect(editor.slash).toBeNull();
    type(editor.lexical, " /");
    await tick();
    expect(editor.slash).not.toBeNull();
    expect(editor.lexical.dispatchCommand(KEY_ESCAPE_COMMAND, key("Escape"))).toBe(true);
    expect(editor.slash).toBeNull();
    type(editor.lexical, "x");
    await tick();
    expect(editor.slash).toBeNull();
    expect(document_text(editor.json)).toBe("and/or /x");
    dispose();
  });

  test("closes when a space is typed after the word", async () => {
    const { editor, dispose } = mounted();
    editor.focus();
    type(editor.lexical, "/ta");
    await tick();
    expect(editor.slash_items[0]?.id).toBe(SlashCommand.TABLE);
    type(editor.lexical, " ");
    await tick();
    expect(editor.slash).toBeNull();
    dispose();
  });
});

describe("¶ marks", () => {
  test("draws marks over the page without touching the document or its exports", async () => {
    const { editor, root, dispose } = mounted();
    editor.load(SAMPLE);
    await tick();
    const before = { json: serialize_document(editor.snapshot()), html: root.innerHTML, markdown: to_markdown(editor.snapshot().editor) };
    const layer = document.createElement("div");
    layer.style.cssText = "position: absolute; inset: 0; pointer-events: none";
    root.parentElement!.append(layer);
    draw_marks([root], layer);
    const glyphs = [...layer.children].map((mark) => mark.textContent);
    expect(glyphs).toContain("¶");
    expect(glyphs).toContain("·");
    expect(glyphs).toContain("↵");
    expect(glyphs.filter((glyph) => glyph === "¶").length).toBeGreaterThanOrEqual(6);
    await tick();
    expect(serialize_document(editor.snapshot())).toBe(before.json);
    expect(root.innerHTML).toBe(before.html);
    expect(to_markdown(editor.snapshot().editor)).toBe(before.markdown);
    expect(editor.dirty).toBe(false);
    layer.remove();
    dispose();
  });
});
