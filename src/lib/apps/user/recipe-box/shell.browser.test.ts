import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import kernel from "$lib/core/api";
import { clear_opfs } from "$lib/core/api/services/files/opfs";
import { FilesService } from "$lib/core/api/services/files/service.svelte";
import type { CommandContext, Tagged } from "$lib/core/api/services/shell/type";
import { DEFAULT_FOLDER, ensure_folder, list_recipes } from "./library";
import { scale as scale_values, type ScaleArgs } from "./shell";

let files: FilesService;

beforeAll(() => {
  files = new FilesService();
  kernel.services.set("files", files);
});

beforeEach(async () => {
  await clear_opfs();
  await files.init();
});

afterAll(() => kernel.services.delete("files"));

async function scale(context: CommandContext<ScaleArgs>): Promise<Tagged[]> {
  const out: Tagged[] = [];
  for await (const value of scale_values(context)) out.push(value);
  return out;
}

function context(args: ScaleArgs) {
  return { args, input: (async function* () {})(), piped: false, session: { cwd: "/home" }, signal: new AbortController().signal, elevated: false } as unknown as CommandContext<ScaleArgs>;
}

async function seed(folder: string, name: string, content: string) {
  await ensure_folder(folder);
  await files.create_file(await files.get_directory(folder), name, { content, overwrite: true });
}

const PANCAKES = "---\ntitle: Pancakes\nservings: 2\ntags: [breakfast]\n---\nMix @flour{125%g}, @milk{1%cup} and @salt{=1%pinch}.\n\nFry in @butter{a little}.";

test("recipe scale yields the scaled list, converted on request", async () => {
  await seed("/home", "pancakes.cook", PANCAKES);
  const values = await scale(context({ path: "pancakes.cook", servings: 4 }));
  expect(values.map((value) => [value.amount, value.name])).toEqual([
    ["250 g", "flour"],
    ["2 cup", "milk"],
    ["1 pinch", "salt"],
    ["a little", "butter"],
  ]);
  expect(values[0]).toMatchObject({ $type: "ingredient", path: "/home/pancakes.cook" });

  const metric = await scale(context({ path: "/home/pancakes.cook", servings: 2, units: "metric" }));
  expect(metric[1].amount).toBe("237 ml");
});

test("recipe scale fails on a missing file", async () => {
  await expect(scale(context({ path: "nope.cook", servings: 2 }))).rejects.toThrow("no such file");
});

test("ensure_folder creates the default folder, list_recipes walks subfolders", async () => {
  await ensure_folder(DEFAULT_FOLDER);
  expect(await files.get_directory(DEFAULT_FOLDER)).not.toBeNull();
  await seed(DEFAULT_FOLDER, "pancakes.cook", PANCAKES);
  await seed(`${DEFAULT_FOLDER}/Soups`, "Tomato.cook", "Simmer @tomatoes{6}.");
  await seed(DEFAULT_FOLDER, "notes.txt", "not a recipe");
  const entries = await list_recipes(DEFAULT_FOLDER);
  expect(entries.map((entry) => [entry.title, entry.path, entry.tags, entry.servings])).toEqual([
    ["Pancakes", `${DEFAULT_FOLDER}/pancakes.cook`, ["breakfast"], 2],
    ["Tomato", `${DEFAULT_FOLDER}/Soups/Tomato.cook`, [], null],
  ]);
});
