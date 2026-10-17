import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import kernel from "$lib/core/api";
import { FilesService } from "$lib/core/api/services/files/service.svelte";
import { create_note, FolderReader, write_card_field } from "./folder-store";

const FOLDER = "/home/quests";
const QUEST = "---\nid: 1\nstatus: raw\nrelated: []\n---\n\n# First quest\n\nBody stays.\n";

let files: FilesService;

beforeAll(async () => {
  files = new FilesService();
  await files.init();
  kernel.services.set("files", files);
});

afterAll(() => {
  kernel.services.delete("files");
});

beforeEach(async () => {
  const home = await files.get_directory("/home");
  if (home && (await files.exists(home, "quests", "directory"))) await files.delete_entry(home, "quests", { recursive: true });
  const folder = await files.create_directory(home, "quests");
  await files.create_file(folder, "first.md", { content: QUEST });
  await files.create_file(folder, "notes.txt", { content: "not a card" });
});

describe("folder boards on disk", () => {
  test("lists markdown files, and sees a change", async () => {
    const reader = new FolderReader(() => files);
    expect((await reader.list(FOLDER))?.map((note) => [note.file, note.title, note.fields.status])).toEqual([["first.md", "First quest", "raw"]]);
    await write_card_field(files, FOLDER, "first.md", "status", "in-progress");
    expect((await reader.list(FOLDER))?.[0].fields.status).toBe("in-progress");
    expect(await reader.list("/home/nope")).toBeNull();
  });

  test("a move rewrites only the field's line", async () => {
    const before = files.revision(FOLDER);
    await write_card_field(files, FOLDER, "first.md", "status", "done");
    expect(await (await files.get_file(`${FOLDER}/first.md`))!.text()).toBe(QUEST.replace("status: raw", "status: done"));
    expect(files.revision(FOLDER)).toBeGreaterThan(before);
  });

  test("a new card comes from the template with the field set", async () => {
    const home = await files.get_directory("/home");
    await files.create_file(home, "quest-template.md", { content: "---\nid:\nstatus: raw\ncreated: {{date:YYYY-MM-DD}}\n---\n\n# {{title}}\n" });
    const name = await create_note(
      files,
      FOLDER,
      { title: "First quest", field: "status", value: "ready", template: "/home/quest-template.md" },
      new Date(2026, 9, 17)
    );
    expect(name).toBe("first-quest.md");
    expect(await (await files.get_file(`${FOLDER}/${name}`))!.text()).toBe("---\nid:\nstatus: ready\ncreated: 2026-10-17\n---\n\n# First quest\n");
    await files.delete_entry(home, "quest-template.md");
  });

  test("without a template, a heading and the field", async () => {
    const name = await create_note(files, FOLDER, { title: "Plain", field: "status", value: "raw", template: null });
    expect(await (await files.get_file(`${FOLDER}/${name}`))!.text()).toBe("---\nstatus: raw\n---\n# Plain\n");
  });
});
