import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import kernel from "$lib/core/api";
import { clear_opfs } from "$lib/core/api/services/files/opfs";
import { FilesService } from "$lib/core/api/services/files/service.svelte";
import type { CommandContext } from "$lib/core/api/services/shell/type";
import { LINGER_MS } from "$lib/core/contexts/app/live-file.svelte";
import { APP_ID, LISTS_FILE, ListColor, empty_file, type Item, type ListsFile } from "./data";
import { items, lists } from "./shell";

let files: FilesService;

beforeAll(() => {
  files = new FilesService();
  kernel.services.set("files", files);
});

beforeEach(async () => {
  await clear_opfs();
  await files.init();
});

afterAll(async () => {
  await new Promise((resolve) => setTimeout(resolve, LINGER_MS + 100));
  kernel.services.delete("files");
});

const item = (text: string, checked = false, extra: Partial<Item> = {}): Item => ({ id: text, text, checked, updated_at: 1, ...extra });

async function seed(file: ListsFile) {
  let directory = await files.get_directory("/var/lib");
  for (const name of ["apps", APP_ID]) directory = await files.create_directory(directory, name);
  await files.create_file(directory, LISTS_FILE, { content: JSON.stringify(file), overwrite: true });
}

const context = (list?: string) => ({ args: { list } }) as unknown as CommandContext<{ list?: string }>;

test("list ls and list items read the lists file, to buy first and deleted items left out", async () => {
  const file = empty_file();
  file.lists[0].items = [item("bread", true), item("milk", false, { qty: 2 }), item("old", false, { deleted_at: 5 })];
  file.lists.push({ id: "hardware", name: "Hardware", color: ListColor.PRIMARY, items: [item("nails")] });
  await seed(file);

  expect(await lists()).toEqual([
    { $type: "shopping-list", id: "groceries", name: "Groceries", left: 1, in_cart: 1 },
    { $type: "shopping-list", id: "hardware", name: "Hardware", left: 1, in_cart: 0 },
  ]);
  const groceries = await items(context("groceries"));
  expect(groceries.map((value) => [value.item, value.in_cart])).toEqual([
    ["milk", false],
    ["bread", true],
  ]);
  expect(groceries[0].amount).not.toBe("");
  expect((await items(context())).map((value) => value.item)).toEqual(["milk", "bread", "nails"]);
  await expect(items(context("pharmacy"))).rejects.toThrow('No list called "pharmacy"');
});
