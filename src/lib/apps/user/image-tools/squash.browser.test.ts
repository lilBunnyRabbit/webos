import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import kernel from "$lib/core/api";
import { clear_opfs } from "$lib/core/api/services/files/opfs";
import { FilesService } from "$lib/core/api/services/files/service.svelte";
import { NotificationsService } from "$lib/core/api/services/notifications/service.svelte";
import type { CommandContext } from "$lib/core/api/services/shell/type";
import { TasksService } from "$lib/core/api/services/tasks/service.svelte";
import { squash, type SquashArgs } from "./shell";

let files: FilesService;
let notifications: NotificationsService;

beforeAll(() => {
  files = new FilesService();
  notifications = new NotificationsService();
  kernel.services.set("files", files);
  kernel.services.set("notifications", notifications);
  kernel.services.set("tasks", new TasksService(kernel));
});

beforeEach(async () => {
  await clear_opfs();
  await files.init();
});

afterAll(() => {
  notifications.destroy();
  kernel.services.delete("files");
  kernel.services.delete("notifications");
  kernel.services.delete("tasks");
});

function context(args: Partial<SquashArgs>) {
  return {
    args: { paths: [], format: "webp", quality: 80, ...args },
    input: (async function* () {})(),
    piped: false,
    session: { cwd: "/home" },
    signal: new AbortController().signal,
    elevated: false,
  } as unknown as CommandContext<SquashArgs>;
}

async function seed(folder: string, name: string, width: number, height: number) {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d")!;
  for (let x = 0; x < width; x += 8) {
    ctx.fillStyle = `hsl(${x % 360} 80% 50%)`;
    ctx.fillRect(x, 0, 8, height);
  }
  const directory = (await files.get_directory(folder))!;
  await files.create_file(directory, name, { content: await canvas.convertToBlob({ type: "image/png" }), overwrite: true });
}

async function size_of(path: string) {
  const bitmap = await createImageBitmap((await files.get_file(path))!);
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return size;
}

test("writes a WebP copy beside each image, scaled down to --max", async () => {
  await seed("/home", "a.png", 400, 200);
  await seed("/home", "b.png", 100, 50);
  const out = await squash(context({ paths: ["a.png", "b.png"], max: 200 }));
  expect(out.map((value) => value.path)).toEqual(["/home/a-squashed.webp", "/home/b-squashed.webp"]);
  expect((await files.get_file("/home/a-squashed.webp"))?.type).toBe("image/webp");
  expect(await size_of("/home/a-squashed.webp")).toEqual({ width: 200, height: 100 });
  expect(await size_of("/home/b-squashed.webp")).toEqual({ width: 100, height: 50 });
});

test("takes every image in a folder and writes JPEG into --to", async () => {
  const home = (await files.get_directory("/home"))!;
  await files.create_directory(home, "shots");
  await files.create_directory(home, "out");
  await seed("/home/shots", "one.png", 64, 64);
  await seed("/home/shots", "two.png", 32, 32);
  await files.create_file((await files.get_directory("/home/shots"))!, "notes.txt", { content: "hi" });
  const out = await squash(context({ paths: ["shots"], format: "jpeg", to: "out" }));
  expect(out.map((value) => value.path)).toEqual(["/home/out/one-squashed.jpg", "/home/out/two-squashed.jpg"]);
  expect((await files.get_file("/home/out/one-squashed.jpg"))?.type).toBe("image/jpeg");
});

test("refuses files that aren't images", async () => {
  await files.create_file((await files.get_directory("/home"))!, "notes.txt", { content: "hi" });
  await expect(squash(context({ paths: ["notes.txt"] }))).rejects.toThrow("not an image");
});
