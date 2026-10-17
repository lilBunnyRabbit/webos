import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import kernel from "$lib/core/api";
import { FilesService } from "$lib/core/api/services/files/service.svelte";
import type { CommandContext } from "$lib/core/api/services/shell/type";
import { json_file } from "$lib/core/contexts/app";
import { add_board, BOARDS_PATH, default_file, KanbanFileSchema, new_folder_board } from "./data";
import { LINGER_MS } from "$lib/core/contexts/app/live-file.svelte";
import { add, archive, done, list, mv } from "./shell";
import { read_boards } from "./store";

let files: FilesService;

beforeAll(async () => {
  files = new FilesService();
  await files.init();
  kernel.services.set("files", files);
});

afterAll(async () => {
  await new Promise((resolve) => setTimeout(resolve, LINGER_MS + 100));
  kernel.services.delete("files");
});

beforeEach(async () => {
  const apps = await files.get_directory("/var/lib/apps");
  if (apps && (await files.exists(apps, "kanban", "directory")))
    await files.delete_entry(apps, "kanban", { recursive: true });
});

const context = <T>(args: T) =>
  ({
    args,
    input: (async function* () {})(),
    piped: false,
    signal: new AbortController().signal,
    elevated: false,
  }) as unknown as CommandContext<T>;

async function collect<T>(values: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const value of values) out.push(value);
  return out;
}

test("commands change the cell an open window holds, and the file", async () => {
  const window_cell = json_file(BOARDS_PATH, default_file(), KanbanFileSchema);
  await vi.waitFor(() => expect(window_cell.ready).toBe(true));

  const added = await add(context({ title: ["Buy", "milk"], due: "2026-10-20" }));
  expect(added).toMatchObject({ $type: "card", board: "Life", column: "Later", title: "Buy milk", due: "2026-10-20" });
  expect(window_cell.value.boards[0].columns[0].cards.map((card) => card.title)).toEqual(["Buy milk"]);

  await mv(context({ card: "milk", column: "doing" }));
  expect(window_cell.value.boards[0].columns[2].cards.map((card) => card.title)).toEqual(["Buy milk"]);

  await expect(add(context({ title: ["x"], column: "nope" }))).rejects.toThrow('no column "nope"');

  expect(await done(context({ card: String(added.id) }))).toMatchObject({ column: "Done" });
  expect(await collect(list(context({ due: true })))).toEqual([]);
  expect(await archive(context({}))).toBe("archived 1 done card");
  expect(window_cell.value.boards[0].archive.map((card) => card.title)).toEqual(["Buy milk"]);

  await vi.waitFor(async () => expect((await read_boards(files))?.boards[0].archive[0]?.title).toBe("Buy milk"));
  window_cell.release();
});

test("works with no window open, and back to back", async () => {
  await add(context({ title: ["One"] }));
  await add(context({ title: ["Two"], column: "next" }));
  const titles = (await collect(list(context({ due: false })))).map((card) => card.title);
  expect(titles).toEqual(["One", "Two"]);
  await vi.waitFor(async () => expect((await read_boards(files))?.boards[0].columns[1].cards[0]?.title).toBe("Two"));
});

describe("folder boards", () => {
  const FOLDER = "/home/quests";
  const QUEST = "---\nid: 1\nstatus: raw\n---\n\n# First quest\n\nBody stays.\n";
  const text = async (name: string) => (await files.get_file(`${FOLDER}/${name}`))!.text();

  beforeEach(async () => {
    const home = await files.get_directory("/home");
    if (home && (await files.exists(home, "quests", "directory"))) await files.delete_entry(home, "quests", { recursive: true });
    const folder = await files.create_directory(home, "quests");
    await files.create_file(folder, "first.md", { content: QUEST });
    await files.create_file(folder, "second.md", { content: "---\nstatus: ready\ndue: 2026-10-20\n---\n# Second quest\n" });
    await files.create_file(home, "quest-template.md", { content: "---\nstatus:\nkind: quest\n---\n\n# {{title}}\n", overwrite: true });
    const cell = json_file(BOARDS_PATH, default_file(), KanbanFileSchema);
    await vi.waitFor(() => expect(cell.ready).toBe(true));
    const board = new_folder_board("Quests", FOLDER);
    cell.value = add_board(default_file(), { ...board, folder: { ...board.folder!, template: "/home/quest-template.md" } });
    cell.release();
  });

  afterAll(async () => {
    const home = await files.get_directory("/home");
    await files.delete_entry(home!, "quests", { recursive: true });
    await files.delete_entry(home!, "quest-template.md");
  });

  test("ls lists the files as cards", async () => {
    const cards = await collect(list(context({ board: "quests", due: false })));
    expect(cards).toEqual([
      expect.objectContaining({ id: "first.md", board: "Quests", column: "raw", title: "First quest", path: `${FOLDER}/first.md` }),
      expect.objectContaining({ id: "second.md", column: "ready", title: "Second quest", due: "2026-10-20" }),
    ]);
    expect((await collect(list(context({ board: "quests", due: true })))).map((card) => card.id)).toEqual(["second.md"]);
  });

  test("mv rewrites only the column field, matched by title or file name", async () => {
    expect(await mv(context({ card: "FIRST QUEST", column: "ready", board: "quests" }))).toMatchObject({ id: "first.md", column: "ready" });
    expect(await text("first.md")).toBe(QUEST.replace("status: raw", "status: ready"));
    await mv(context({ card: "first.md", column: "raw", board: "quests" }));
    expect(await text("first.md")).toBe(QUEST);
    await expect(mv(context({ card: "quest", column: "raw", board: "quests" }))).rejects.toThrow(
      '"quest" matches 2 cards: first.md First quest, second.md Second quest'
    );
    await expect(mv(context({ card: "first", column: "nope", board: "quests" }))).rejects.toThrow('no column "nope"');
  });

  test("add creates a file from the template", async () => {
    const added = await add(context({ title: ["Third", "quest"], column: "ready", due: "2026-10-30", board: "quests" }));
    expect(added).toMatchObject({ id: "third-quest.md", column: "ready", title: "Third quest", due: "2026-10-30" });
    expect(await text("third-quest.md")).toBe("---\nstatus: ready\nkind: quest\ndue: 2026-10-30\n---\n\n# Third quest\n");
    expect(await add(context({ title: ["Fourth"], board: "quests" }))).toMatchObject({ column: "raw" });
  });
});
