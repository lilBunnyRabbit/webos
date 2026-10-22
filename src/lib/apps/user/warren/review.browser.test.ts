import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import kernel from "$lib/core/api";
import { clear_opfs } from "$lib/core/api/services/files/opfs";
import { FilesService } from "$lib/core/api/services/files/service.svelte";
import { WarrenEditor } from "./editor.svelte";
import { SAMPLE, SAMPLE_V6 } from "./fixture";
import { create_document, parse_document, serialize_document, type DocNode } from "./format";
import { snapshot_name } from "./history";
import { HISTORY_DIR, list_snapshots, read_snapshot, write_snapshot } from "./history-files";
import { blocks_of, document_text, mark_ids } from "./model";
import { add_words, check_words, start_speller, stop_speller, suggest_word } from "./speller";
import { spell_words } from "./spelling";

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

describe("document id", () => {
  test("a new document has one, an old one gets one on demand, a copy a new one", () => {
    const { editor, dispose } = editor_with(create_document());
    const first = editor.doc_id;
    expect(first).toBeTruthy();
    expect(editor.snapshot().id).toBe(first);
    editor.load(SAMPLE);
    expect(editor.doc_id).toBeNull();
    expect(editor.snapshot().id).toBeUndefined();
    const given = editor.ensure_id();
    expect(editor.ensure_id()).toBe(given);
    expect(editor.renew_id()).not.toBe(given);
    editor.load(SAMPLE_V6);
    expect(editor.doc_id).toBe(SAMPLE_V6.id);
    dispose();
  });
});

describe("comments", () => {
  test("loads marks, paints their state and saves them back", async () => {
    const { editor, root, dispose } = editor_with(SAMPLE_V6);
    await tick();
    const marks = [...root.querySelectorAll<HTMLElement>("mark.wr-mark")];
    expect(marks.map((mark) => mark.dataset.comment)).toEqual(["open", "open"]);
    const saved = parse_document(serialize_document(editor.snapshot()));
    expect(saved.comments).toEqual(SAMPLE_V6.comments);
    expect(mark_ids(saved.editor)).toEqual(["c-one", "c-two"]);
    expect(saved.ignored_words).toEqual(["warren"]);
    dispose();
  });

  test("comments on a selection, resolves, reopens and deletes", async () => {
    const { editor, root, dispose } = editor_with();
    await tick();
    editor.select_next("learner");
    await tick();
    const at = editor.capture_body_selection();
    expect(editor.add_comment("Too modest", at, "learner")).toBe(true);
    await tick();
    const [comment] = editor.comments;
    expect(comment).toMatchObject({ text: "Too modest", quote: "learner" });
    expect(mark_ids(editor.json)).toEqual([comment.id]);
    expect(root.querySelector<HTMLElement>("mark.wr-mark")?.textContent).toBe("learner");
    expect(editor.dirty).toBe(true);
    editor.set_comment(comment.id, { resolved: true });
    expect(root.querySelector<HTMLElement>("mark.wr-mark")?.dataset.comment).toBe("resolved");
    editor.set_comment(comment.id, { resolved: false });
    expect(editor.comments[0].resolved).toBeUndefined();
    expect(editor.show_comment(comment.id, false)).toBe(true);
    await tick();
    expect(editor.selected).toBe("learner");
    editor.delete_comment(comment.id);
    await tick();
    expect(editor.comments).toEqual([]);
    expect(root.querySelector("mark")).toBeNull();
    expect(document_text(editor.json)).toBe(document_text(SAMPLE.editor));
    dispose();
  });

  test("refuses a comment without a selection", async () => {
    const { editor, dispose } = editor_with();
    await tick();
    expect(editor.add_comment("Nothing", null, "")).toBe(false);
    expect(editor.comments).toEqual([]);
    dispose();
  });
});

describe("words across runs", () => {
  test("selects and replaces a word split between two runs, keeping the first run's format", async () => {
    const split = structuredClone(SAMPLE);
    split.editor.root.children[0] = {
      type: "paragraph",
      version: 1,
      children: [
        { type: "text", text: "A fa", format: 1, style: "", version: 1 } as DocNode,
        { type: "text", text: "st fox, a fast one", format: 0, style: "", version: 1 } as DocNode,
      ],
    } as DocNode;
    const { editor, dispose } = editor_with(split);
    await tick();
    editor.select_next("fast", false);
    await tick();
    expect(editor.selected).toBe("fast");
    editor.select_next("fast", false);
    await tick();
    expect(editor.selected).toBe("fast");
    expect(editor.replace_word_everywhere("fast", "quick")).toBe(4);
    await tick();
    const [first] = blocks_of(editor.json);
    expect(first.kind === "paragraph" && first.runs.map((run) => [run.text, run.bold])).toEqual([
      ["A quick", true],
      [" fox, a quick one", false],
    ]);
    expect(document_text(editor.json)).toContain("A quick learner, very quick\nBreakfast");
    editor.undo();
    await tick();
    expect(document_text(editor.json)).toBe(document_text(split.editor));
    dispose();
  });
});

describe("restore", () => {
  test("puts a version back as one undoable change", async () => {
    const { editor, dispose } = editor_with(SAMPLE_V6);
    await tick();
    editor.restore(SAMPLE);
    await tick();
    expect(document_text(editor.json)).toBe(document_text(SAMPLE.editor));
    expect(editor.page).toEqual(SAMPLE.page);
    expect(editor.comments.map((comment) => comment.id)).toEqual(["c-one", "c-two"]);
    expect(editor.doc_id).toBe(SAMPLE_V6.id);
    expect(editor.dirty).toBe(true);
    expect(editor.can_undo).toBe(true);
    editor.undo();
    await tick();
    expect(document_text(editor.json)).toBe(document_text(SAMPLE_V6.editor));
    dispose();
  });
});

describe("history files", () => {
  let files: FilesService;

  beforeAll(() => {
    files = new FilesService();
    kernel.services.set("files", files);
  });

  beforeEach(async () => {
    await clear_opfs();
    await files.init();
  });

  afterAll(() => {
    kernel.services.delete("files");
  });

  test("writes snapshots under the document's id, lists them newest first and thins old ones", async () => {
    const id = SAMPLE_V6.id!;
    const day = 24 * 60 * 60_000;
    const now = Date.now();
    const old = new Date(now - 3 * day);
    old.setHours(9, 0, 0, 0);
    await write_snapshot(id, serialize_document(SAMPLE), 14, old.getTime());
    await write_snapshot(id, serialize_document(SAMPLE), 15, old.getTime() + 60 * 60_000);
    await write_snapshot(id, serialize_document(SAMPLE_V6), 7, now);
    const listed = await list_snapshots(id);
    expect(listed.map((snapshot) => snapshot.words)).toEqual([7, 15]);
    expect(listed[1].name).toBe(snapshot_name(old.getTime() + 60 * 60_000, 15));
    expect(await read_snapshot(id, listed[0])).toEqual(SAMPLE_V6);
    expect((await files.get_directory(`${HISTORY_DIR}/${id}`)) !== null).toBe(true);
    expect(await list_snapshots("0b9d6bcd-0000-4000-8000-000000000000")).toEqual([]);
    await expect(write_snapshot("../../etc", "{}", 0)).rejects.toThrow("Not a document id");
  });
});

describe("spelling worker", () => {
  test("checks, suggests and learns words with the real dictionary", { timeout: 60_000 }, async () => {
    const started = performance.now();
    const loaded = await start_speller(["Warren"]);
    const startup = performance.now() - started;
    expect(await check_words(["the", "quick", "teh", "recieve", "Warren", "don't", "colour"])).toEqual(["teh", "recieve", "colour"]);
    expect(await suggest_word("recieve")).toContain("receive");
    await add_words(["Lilbunny"]);
    expect(await check_words(["Lilbunny"])).toEqual([]);

    const text = (await import("../../../../../docs/apps/warren.md?raw")).default;
    const counts = spell_words(text);
    const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
    const unique = [...new Set([...counts.keys()].map((word) => word.replace(/’/g, "'")))];
    const before = performance.now();
    const wrong = await check_words(unique);
    const check_ms = performance.now() - before;
    console.info(
      `spelling: worker ready in ${Math.round(startup)} ms (dictionary fetched and parsed in ${loaded.ms} ms); ${total} words, ${unique.length} distinct, checked in ${check_ms.toFixed(1)} ms, ${wrong.length} unknown`
    );
    expect(total).toBeGreaterThanOrEqual(5000);
    stop_speller();
  });
});
