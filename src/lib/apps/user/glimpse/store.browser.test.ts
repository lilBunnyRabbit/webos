import { afterAll, beforeEach, expect, test } from "vitest";
import kernel from "$lib/core/api";
import { FilesService } from "$lib/core/api/services/files/service.svelte";
import { clear_opfs } from "$lib/core/api/services/files/opfs";
import { app_data_path } from "$lib/core/contexts/app";
import { APP_ID, EMPTY_INDEX, PHOTOS, THUMBS } from "./photos";
import { clean_orphans, erase_expired, save_shot, type IndexHolder } from "./store";

let files: FilesService;

beforeEach(async () => {
  await clear_opfs();
  files = new FilesService();
  await files.init();
  kernel.services.set("files", files);
});

afterAll(() => {
  kernel.services.delete("files");
});

const frame = () => createImageBitmap(new ImageData(40, 30));
const names = async (folder: string) => {
  const directory = await files.get_directory(app_data_path(APP_ID, folder));
  return directory ? (await files.list(directory)).map((item) => item.name).sort() : [];
};

test("saves shots into one batch, sweeps orphans and erases expired batches with their files", async () => {
  const index: IndexHolder = { value: structuredClone(EMPTY_INDEX) };
  const batch = () => ({ id: "b1", created: 1000, expires: 5000 });

  await Promise.all([save_shot(files, index, batch, await frame(), 0, "p1", 1000), save_shot(files, index, batch, await frame(), 1, "p2", 1001)]);
  expect(index.value.batches).toHaveLength(1);
  expect(index.value.batches[0].photos.map(({ id, width, height }) => ({ id, width, height }))).toEqual([
    { id: "p1", width: 40, height: 30 },
    { id: "p2", width: 30, height: 40 },
  ]);
  expect(await names(PHOTOS)).toEqual(["p1.jpg", "p2.jpg"]);
  expect(await names(THUMBS)).toEqual(["p1.jpg", "p2.jpg"]);

  await files.create_file(await files.get_directory(app_data_path(APP_ID, PHOTOS)), "stray.jpg", { content: "x" });
  expect(await clean_orphans(files, index, Date.now() + 3_600_000)).toBe(1);
  expect(await names(PHOTOS)).toEqual(["p1.jpg", "p2.jpg"]);

  expect(await erase_expired(files, index, 4999)).toBe(0);
  expect(await erase_expired(files, index, 5000)).toBe(1);
  expect(index.value.batches).toEqual([]);
  expect(await names(PHOTOS)).toEqual([]);
  expect(await names(THUMBS)).toEqual([]);
});
