import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import kernel from "$lib/core/api";
import { clear_opfs } from "$lib/core/api/services/files/opfs";
import { FilesService } from "$lib/core/api/services/files/service.svelte";
import { NotificationsService } from "$lib/core/api/services/notifications/service.svelte";
import type { CommandContext } from "$lib/core/api/services/shell/type";
import { TasksService } from "$lib/core/api/services/tasks/service.svelte";
import { convert_all } from "./shell";
import { read_zip } from "$lib/core/utils/zip/read";

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

function context<T>(args: T) {
  return {
    args,
    input: (async function* () {})(),
    piped: false,
    session: { cwd: "/home" },
    signal: new AbortController().signal,
    elevated: false,
  } as unknown as CommandContext<T>;
}

async function seed_noise(name: string, width: number, height: number, type = "image/png") {
  const image = new ImageData(width, height);
  for (let at = 0; at < image.data.length; at += 65_536) crypto.getRandomValues(image.data.subarray(at, at + 65_536));
  for (let i = 3; i < image.data.length; i += 4) image.data[i] = 255;
  const canvas = new OffscreenCanvas(width, height);
  canvas.getContext("2d")!.putImageData(image, 0, 0);
  const blob = await canvas.convertToBlob({ type, quality: 0.9 });
  await files.create_file((await files.get_directory("/home"))!, name, { content: blob, overwrite: true });
  return blob.size;
}

async function dimensions(path: string) {
  const bitmap = await createImageBitmap((await files.get_file(path))!);
  const size = [bitmap.width, bitmap.height];
  bitmap.close();
  return size;
}

test("image convert-all writes every format into a folder next to the image", async () => {
  await seed_noise("pic.png", 40, 30);
  const out = await convert_all(context({ path: "pic.png", zip: false }));
  expect(out.map((value) => value.path)).toEqual([
    "/home/pic-formats/pic.jpg",
    "/home/pic-formats/pic.webp",
    "/home/pic-formats/pic.avif",
    "/home/pic-formats/pic.jxl",
    "/home/pic-formats/pic.png",
    "/home/pic-formats/pic.gif",
    "/home/pic-formats/pic.bmp",
    "/home/pic-formats/pic.ico",
    "/home/pic-formats/pic.tiff",
    "/home/pic-formats/pic.qoi",
    "/home/pic-formats/pic.tga",
    "/home/pic-formats/pic.ppm",
  ]);
  expect(await dimensions("/home/pic-formats/pic.bmp")).toEqual([40, 30]);
  expect((await files.get_file("/home/pic-formats/pic.tiff"))!.size).toBeGreaterThan(40 * 30 * 3);
}, 60_000);

test("--zip writes one zip of every format", async () => {
  await seed_noise("pic.png", 20, 20);
  const [zip] = await convert_all(context({ path: "pic.png", zip: true }));
  expect(zip.path).toBe("/home/pic-formats.zip");
  const archive = await read_zip((await files.get_file(zip.path))!);
  expect(archive.entries.map((entry) => entry.name)).toHaveLength(12);
  expect(archive.entries.map((entry) => entry.name)).toContain("pic.qoi");
}, 60_000);

test("refuses what isn't an image", async () => {
  await files.create_file((await files.get_directory("/home"))!, "notes.txt", { content: "hi" });
  await expect(convert_all(context({ path: "notes.txt", zip: false }))).rejects.toThrow("not an image");
});
