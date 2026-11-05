import { afterEach, beforeEach, expect, test } from "vitest";
import { clear_opfs } from "../files/opfs";
import { FilesService } from "../files/service.svelte";
import { copy_app_storage } from "./storage-copy";

let files: FilesService;

const read = async (path: string) => (await (await files.get_file(path))?.text()) ?? null;
const clear_app_keys = () => Object.keys(localStorage).forEach((key) => key.startsWith("app.") && localStorage.removeItem(key));

beforeEach(async () => {
  await clear_opfs();
  files = new FilesService();
  await files.init();
  clear_app_keys();
});

afterEach(clear_app_keys);

test("moves app.* keys into each app's storage.json, over keys already there, then removes them", async () => {
  const apps = await files.create_directory(await files.get_directory("/var/lib"), "apps");
  const snake = await files.create_directory(apps, "snake");
  await files.create_file(snake, "storage.json", { content: JSON.stringify({ best: 3, speed: "slow" }), overwrite: true });
  localStorage.setItem("app.snake.best", "12");
  localStorage.setItem("app.snake.board.size", '{"w":20}');
  localStorage.setItem("app.notes.font", "mono");
  localStorage.setItem("kernel.test", "outside");

  await copy_app_storage(files, localStorage);

  expect(JSON.parse((await read("/var/lib/apps/snake/storage.json"))!)).toEqual({ best: 12, speed: "slow", "board.size": { w: 20 } });
  expect(JSON.parse((await read("/var/lib/apps/notes/storage.json"))!)).toEqual({ font: "mono" });
  expect(Object.keys(localStorage).filter((key) => key.startsWith("app."))).toEqual([]);
  expect(localStorage.getItem("kernel.test")).toBe("outside");
  localStorage.removeItem("kernel.test");

  const before = await read("/var/lib/apps/snake/storage.json");
  await copy_app_storage(files, localStorage);
  expect(await read("/var/lib/apps/snake/storage.json")).toBe(before);
  expect((await files.list(await files.get_directory("/var/lib"))).map((item) => item.name)).toEqual(["apps"]);
});
