import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import kernel from "$lib/core/api";
import { clear_opfs } from "$lib/core/api/services/files/opfs";
import { FilesService } from "$lib/core/api/services/files/service.svelte";
import type { CommandContext } from "$lib/core/api/services/shell/type";
import { entry_blob, read_zip } from "$lib/core/utils/zip/read";
import { build_docx } from "./docx";
import { BlockStyle, WarrenEditor } from "./editor.svelte";
import { SAMPLE, SAMPLE_V3 } from "./fixture";
import { parse_document, serialize_document } from "./format";
import { $getSelection, $isRangeSelection } from "lexical";
import { Align, blocks_of, document_text } from "./model";
import { count_document, export_document } from "./shell";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function editor_with(document = SAMPLE, smart = () => true) {
  const editor = new WarrenEditor((error) => {
    throw error;
  }, smart);
  const root = window.document.createElement("div");
  root.contentEditable = "true";
  window.document.body.append(root);
  editor.mount(root);
  editor.load(document);
  return { editor, root, dispose: () => (editor.destroy(), root.remove()) };
}

describe("editor", () => {
  test("loads a document and saves the same blocks back, page break included", async () => {
    const { editor, root, dispose } = editor_with();
    await tick();
    expect(root.querySelector(".page-break")).not.toBeNull();
    const saved = parse_document(serialize_document(editor.snapshot()));
    expect(blocks_of(saved.editor)).toEqual(blocks_of(SAMPLE.editor));
    expect(saved.page).toEqual(SAMPLE.page);
    expect(editor.dirty).toBe(false);
    dispose();
  });

  test("starts clean and follows the history's undo and redo", async () => {
    const fresh = new WarrenEditor((error) => {
      throw error;
    });
    expect(fresh.dirty).toBe(false);
    expect(fresh.can_undo).toBe(false);
    fresh.destroy();
    const { editor, dispose } = editor_with();
    await tick();
    expect([editor.can_undo, editor.can_redo]).toEqual([false, false]);
    editor.change_everywhere("fast", "quick");
    await tick();
    expect([editor.can_undo, editor.can_redo]).toEqual([true, false]);
    editor.undo();
    await tick();
    expect([editor.can_undo, editor.can_redo]).toEqual([false, true]);
    dispose();
  });

  test("changes a word everywhere as one undo step", async () => {
    const { editor, dispose } = editor_with();
    await tick();
    expect(editor.change_everywhere("fast", "quick")).toBe(2);
    await tick();
    expect(document_text(editor.json)).toContain("A quick learner, very quick\nBreakfast fan.");
    expect(editor.dirty).toBe(true);
    editor.undo();
    await tick();
    expect(document_text(editor.json)).toBe(document_text(SAMPLE.editor));
    dispose();
  });

  test("selects the next occurrence of a word", async () => {
    const { editor, dispose } = editor_with();
    await tick();
    editor.select_next("fast");
    await tick();
    expect(editor.word).toBe("fast");
    dispose();
  });

  test("links the selection, edits the link and removes it", async () => {
    const { editor, root, dispose } = editor_with();
    await tick();
    editor.select_next("learner");
    editor.set_link("https://example.com/me");
    await tick();
    expect(editor.link).toBe("https://example.com/me");
    expect(root.querySelector("a[href='https://example.com/me']")?.textContent).toBe("learner");
    editor.set_link("https://example.com/you");
    await tick();
    expect(blocks_of(editor.json)[1].kind === "paragraph" && blocks_of(editor.json)[1]).toMatchObject({ runs: expect.arrayContaining([expect.objectContaining({ text: "learner", link: "https://example.com/you" })]) });
    editor.set_link(null);
    await tick();
    expect(root.querySelector("a[href*='example.com/you']")).toBeNull();
    expect(document_text(editor.json)).toBe(document_text(SAMPLE.editor));
    dispose();
  });

  test("keeps links that come in as HTML, as a paste does", async () => {
    const { editor, dispose } = editor_with();
    editor.load_html(`<p>See <a href="https://example.com">my site</a> and <a href="javascript:alert(1)">this</a>.</p>`);
    await tick();
    const [paragraph] = blocks_of(editor.json);
    expect(paragraph.kind === "paragraph" && paragraph.runs.map((run) => [run.text, run.link])).toEqual([
      ["See ", null],
      ["my site", "https://example.com"],
      [" and ", null],
      ["this", null],
      [".", null],
    ]);
    dispose();
  });

  test("finds text, replaces one match and then all of them", async () => {
    const { editor, dispose } = editor_with();
    await tick();
    const matches = editor.find("fast", false);
    expect(matches).toHaveLength(3);
    expect(editor.find("fast", true)).toHaveLength(2);
    editor.replace_match(matches[0], "fast", "slow");
    expect(document_text(editor.json)).toContain("A slow learner, very fast\nBreakfast");
    expect(editor.next_after_selection(editor.find("fast", false))).toBe(0);
    expect(editor.replace_all("fast", "quick", false)).toBe(2);
    expect(document_text(editor.json)).toContain("A slow learner, very quick\nBreakquick");
    editor.undo();
    await tick();
    expect(document_text(editor.json)).toContain("very fast\nBreakfast");
    dispose();
  });

  test("strikes, lowers, raises and clears the selection's formatting", async () => {
    const { editor, dispose } = editor_with();
    await tick();
    editor.select_next("learner");
    editor.toggle_bold();
    editor.toggle_strike();
    editor.toggle_subscript();
    await tick();
    expect([editor.bold, editor.strike, editor.subscript, editor.superscript]).toEqual([true, true, true, false]);
    editor.toggle_superscript();
    await tick();
    expect([editor.subscript, editor.superscript]).toEqual([false, true]);
    const run = () => {
      const paragraph = blocks_of(editor.json)[1];
      return paragraph.kind === "paragraph" ? paragraph.runs.find((item) => item.text.includes("learner")) : undefined;
    };
    expect(run()).toMatchObject({ bold: true, strike: true, script: "super" });
    editor.select_next("fast");
    editor.set_size(18);
    editor.select_next("learner");
    editor.clear_formatting();
    await tick();
    expect(run()).toMatchObject({ bold: false, strike: false, script: null, size: null });
    expect(document_text(editor.json)).toBe(document_text(SAMPLE.editor));
    dispose();
  });

  test("makes a check list, inserts a horizontal line and keeps both in the file", async () => {
    const { editor, root, dispose } = editor_with();
    await tick();
    editor.select_next("learner");
    editor.set_block(BlockStyle.CHECK);
    await tick();
    expect(editor.block).toBe(BlockStyle.CHECK);
    expect(root.querySelector("ul.wr-check > li.wr-unchecked")).not.toBeNull();
    editor.insert_rule();
    await tick();
    expect(root.querySelector("hr.wr-rule")).not.toBeNull();
    const saved = parse_document(serialize_document(editor.snapshot()));
    const kinds = blocks_of(saved.editor).map((block) => (block.kind === "item" ? `${block.kind}:${block.list}` : block.kind));
    expect(kinds).toContain("item:check");
    expect(kinds).toContain("rule");
    const reopened = editor_with(saved);
    await tick();
    expect(reopened.root.querySelector("hr.wr-rule")).not.toBeNull();
    expect(reopened.root.querySelector("li.wr-unchecked")).not.toBeNull();
    reopened.dispose();
    dispose();
  });

  test("opens a format 3 file with its goal and lists its headings", async () => {
    const { editor, root, dispose } = editor_with(SAMPLE_V3);
    await tick();
    expect(editor.goal).toBe(500);
    expect(root.querySelector("li.wr-checked")).not.toBeNull();
    expect(editor.outline.map((heading) => [heading.level, heading.text])).toEqual([[2, "Plan"]]);
    editor.set_goal(800);
    expect(editor.dirty).toBe(true);
    expect(editor.snapshot().goal).toBe(800);
    editor.set_goal(null);
    expect(editor.snapshot().goal).toBeUndefined();
    dispose();
  });

  test("jumps to a heading from the outline", async () => {
    const { editor, dispose } = editor_with();
    await tick();
    const [heading] = editor.outline;
    expect(heading).toMatchObject({ level: 1, text: "Jane & Co <CV>" });
    editor.select_next("learner");
    editor.go_to(heading.key, false);
    await tick();
    const at = editor.lexical.getEditorState().read(() => {
      const selection = $getSelection();
      return $isRangeSelection(selection) ? selection.anchor.getNode().getTopLevelElement()?.getKey() : null;
    });
    expect(at).toBe(heading.key);
    dispose();
  });

  test("curls quotes and makes dashes as you type, and Undo gives back what was typed", async () => {
    let on = true;
    const { editor, dispose } = editor_with(SAMPLE, () => on);
    await tick();
    const type = (text: string) => {
      for (const character of text) {
        editor.lexical.update(
          () => {
            const selection = $getSelection();
            if ($isRangeSelection(selection)) selection.insertText(character);
          },
          { discrete: true }
        );
      }
    };
    editor.select_next("learner");
    editor.lexical.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) selection.removeText();
    }, { discrete: true });
    type(`"ok" -- it's...`);
    await tick();
    expect(document_text(editor.json)).toContain("A fast “ok” – it’s…, very fast");
    editor.undo();
    await tick();
    expect(document_text(editor.json)).toContain("A fast “ok” – it’s..., very fast");
    on = false;
    type(`"`);
    await tick();
    expect(document_text(editor.json)).toContain(`it’s...", very`);
    dispose();
  });

  test("underlines the selection and aligns its paragraph", async () => {
    const { editor, root, dispose } = editor_with();
    await tick();
    editor.select_next("fast");
    editor.toggle_underline();
    editor.set_align(Align.JUSTIFY);
    await tick();
    expect(editor.underline).toBe(true);
    expect(editor.align).toBe(Align.JUSTIFY);
    const paragraph = blocks_of(editor.json)[1];
    expect(paragraph.kind === "paragraph" && paragraph.align).toBe("justify");
    expect(paragraph.kind === "paragraph" && paragraph.runs.find((run) => run.text === "fast")?.underline).toBe(true);
    expect(root.querySelector("p")?.style.textAlign).toBe("justify");
    dispose();
  });
});

test("the .docx parts are well-formed XML and every relationship resolves", async () => {
  const blob = await build_docx(SAMPLE, "CV");
  const archive = await read_zip(blob);
  const parts = new Map<string, Document>();
  for (const entry of archive.entries) {
    const xml = new DOMParser().parseFromString(await (await entry_blob(blob, entry)).text(), "application/xml");
    expect(xml.querySelector("parsererror"), entry.name).toBeNull();
    parts.set(entry.name, xml);
  }
  const targets = (name: string, base: string) =>
    [...parts.get(name)!.getElementsByTagName("Relationship")]
      .filter((relationship) => relationship.getAttribute("TargetMode") !== "External")
      .map((relationship) => base + relationship.getAttribute("Target"));
  for (const target of [...targets("_rels/.rels", ""), ...targets("word/_rels/document.xml.rels", "word/")]) expect(parts.has(target), target).toBe(true);
});

describe("shell", () => {
  let files: FilesService;
  const context = <T>(args: T) =>
    ({ args, input: (async function* () {})(), piped: false, session: { cwd: "/home" }, signal: new AbortController().signal, elevated: false }) as unknown as CommandContext<T>;

  beforeAll(() => {
    files = new FilesService();
    kernel.services.set("files", files);
  });

  beforeEach(async () => {
    await clear_opfs();
    await files.init();
    await files.create_file(await files.get_directory("/home"), "CV.warren", { content: serialize_document(SAMPLE) });
  });

  afterAll(() => {
    kernel.services.delete("files");
  });

  test("doc count reads a format 3 file", async () => {
    await files.create_file(await files.get_directory("/home"), "Plan.warren", { content: serialize_document(SAMPLE_V3) });
    expect(await count_document(context({ path: "Plan.warren" }))).toMatchObject({ words: 8 });
    expect(await export_document(context({ path: "Plan.warren", docx: true }))).toMatchObject({ path: "/home/Plan.docx" });
  });

  test("doc count reads a version 1 file too", async () => {
    await files.create_file(await files.get_directory("/home"), "Old.warren", { content: JSON.stringify({ ...JSON.parse(serialize_document(SAMPLE)), version: 1 }) });
    expect(await count_document(context({ path: "Old.warren" }))).toMatchObject({ words: 14, characters: 68 });
  });

  test("doc count reads words and characters from the file", async () => {
    expect(await count_document(context({ path: "CV.warren" }))).toMatchObject({ $type: "doc-count", name: "CV.warren", words: 14, characters: 68 });
  });

  test("doc export writes a .docx beside it under a free name", async () => {
    await expect(export_document(context({ path: "CV.warren", docx: false }))).rejects.toThrow("--docx");
    expect(await export_document(context({ path: "CV.warren", docx: true }))).toMatchObject({ $type: "file", path: "/home/CV.docx" });
    expect(await export_document(context({ path: "CV.warren", docx: true }))).toMatchObject({ path: "/home/CV (1).docx" });
    const written = await files.get_file("/home/CV.docx");
    expect((await read_zip(written!)).entries.some((entry) => entry.name === "word/document.xml")).toBe(true);
  });
});
