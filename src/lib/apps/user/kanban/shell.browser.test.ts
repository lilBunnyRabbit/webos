import { afterAll, beforeAll, beforeEach, expect, test, vi } from "vitest";
import kernel from "$lib/core/api";
import { FilesService } from "$lib/core/api/services/files/service.svelte";
import type { CommandContext } from "$lib/core/api/services/shell/type";
import { json_file } from "$lib/core/contexts/app/json-file.svelte";
import { BOARDS_PATH, default_file, KanbanFileSchema } from "./data";
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
