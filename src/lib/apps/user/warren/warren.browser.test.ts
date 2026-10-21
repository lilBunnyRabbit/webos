import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import kernel from "$lib/core/api";
import { clear_opfs } from "$lib/core/api/services/files/opfs";
import { FilesService } from "$lib/core/api/services/files/service.svelte";
import type { CommandContext } from "$lib/core/api/services/shell/type";
import { entry_blob, read_zip } from "$lib/core/utils/zip/read";
import { build_docx } from "./docx";
import { WarrenEditor } from "./editor.svelte";
import { SAMPLE } from "./fixture";
import { parse_document, serialize_document } from "./format";
import { Align, blocks_of, document_text } from "./model";
import { count_document, export_document } from "./shell";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function editor_with(document = SAMPLE) {
  const editor = new WarrenEditor((error) => {
    throw error;
  });
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
    [...parts.get(name)!.getElementsByTagName("Relationship")].map((relationship) => base + relationship.getAttribute("Target"));
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
