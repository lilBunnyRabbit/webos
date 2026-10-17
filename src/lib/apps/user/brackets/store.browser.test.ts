import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import kernel from "$lib/core/api";
import { FilesService } from "$lib/core/api/services/files/service.svelte";
import { json_file } from "$lib/core/contexts/app";
import { BRACKETS_DIR, BracketFileSchema, create_bracket, default_format, FormatKind } from "./bracket";
import { pick } from "./state";
import { list_brackets, parse_bracket, save_new } from "./store";

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
  const directory = await files.get_directory(BRACKETS_DIR);
  if (!directory) return;
  for (const item of await files.list(directory)) {
    if (item.name.endsWith(".bracket")) await files.delete_entry(directory, item.name);
  }
});

describe("bracket files", () => {
  test("new brackets get free names in Documents and show in the list", async () => {
    const bracket = create_bracket("Friday", ["Ana", "Bor", "Cene"], default_format(FormatKind.SINGLE, 3), 1);
    const first = await save_new(files, bracket);
    const second = await save_new(files, bracket);
    expect(first).toBe(`${BRACKETS_DIR}/Friday.bracket`);
    expect(second).toBe(`${BRACKETS_DIR}/Friday (1).bracket`);
    const entries = await list_brackets(files);
    expect(entries.map((entry) => entry.path).sort()).toEqual([first, second].sort());
    expect(entries[0]).toMatchObject({ name: "Friday", format: FormatKind.SINGLE, players: 3 });
  });

  test("a result made through the open file is saved to disk", async () => {
    const path = await save_new(files, create_bracket("Cup", ["Ana", "Bor"], default_format(FormatKind.SINGLE, 2), 1));
    const cell = json_file(path, null, BracketFileSchema);
    try {
      await vi.waitFor(() => expect(cell.value).not.toBeNull());
      cell.value = pick(cell.value!, "w1-0", "p2");
      await vi.waitFor(async () => {
        const saved = parse_bracket(await (await files.get_file(path))!.text());
        expect(saved?.results).toEqual([{ kind: "match", match: "w1-0", winner: "p2" }]);
      });
    } finally {
      cell.release();
    }
  });

  test("invalid files are left out of the list", async () => {
    const directory = await files.get_directory(BRACKETS_DIR);
    await files.create_file(directory, "broken.bracket", { content: "{" });
    expect(await list_brackets(files)).toEqual([]);
  });
});
