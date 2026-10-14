import { flushSync } from "svelte";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import kernel from "$lib/core/api";
import { FilesService } from "$lib/core/api/services/files/service.svelte";
import { json_file } from "$lib/core/contexts/app/json-file.svelte";
import { add_card, BOARDS_PATH, default_file, KanbanFileSchema, new_card, update_board } from "./data";
import { read_boards } from "./store";

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
  const apps = await files.get_directory("/var/lib/apps");
  if (apps && (await files.exists(apps, "kanban", "directory"))) await files.delete_entry(apps, "kanban", { recursive: true });
});

describe("boards file", () => {
  test("the first edit creates the file and the badge reader sees it", async () => {
    expect(await read_boards(files)).toBeNull();
    const boards = json_file(BOARDS_PATH, default_file(), KanbanFileSchema);
    await vi.waitFor(() => expect(boards.ready).toBe(true));

    boards.value = update_board(boards.value, "life", (board) => add_card(board, "later", new_card("Groceries")));
    flushSync();
    await vi.waitFor(async () => expect((await read_boards(files))?.boards[0].columns[0].cards[0]?.title).toBe("Groceries"));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(boards.value.boards[0].columns[0].cards.map((card) => card.title)).toEqual(["Groceries"]);
    expect(boards.error).toBeNull();
    boards.release();
  });

  test("an invalid file reads as null", async () => {
    const lib = await files.get_directory("/var/lib/apps");
    const directory = await files.create_directory(lib, "kanban");
    await files.create_file(directory, "boards.json", { content: "{ nope", overwrite: true });
    expect(await read_boards(files)).toBeNull();
  });
});
