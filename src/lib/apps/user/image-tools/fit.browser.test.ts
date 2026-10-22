import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import kernel from "$lib/core/api";
import { clear_opfs } from "$lib/core/api/services/files/opfs";
import { FilesService } from "$lib/core/api/services/files/service.svelte";
import { NotificationsService } from "$lib/core/api/services/notifications/service.svelte";
import type { CommandContext } from "$lib/core/api/services/shell/type";
import { TasksService } from "$lib/core/api/services/tasks/service.svelte";
import { fit, squash, type FitArgs, type SquashArgs } from "./shell";

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

test("image fit writes a JPEG under the limit next to the original", async () => {
  await seed_noise("noise.png", 400, 300);
  const out = await fit(context<FitArgs>({ path: "noise.png", size: "60KB", format: "jpeg" }));
  expect(out.path).toBe("/home/noise-fit.jpg");
  const file = (await files.get_file(out.path))!;
  expect(file.type).toBe("image/jpeg");
  expect(file.size).toBeLessThanOrEqual(60_000);
  expect(file.size).toBeGreaterThan(30_000);
});

test("a lossless format only scales, and keeps the ratio", async () => {
  await seed_noise("noise.png", 400, 200);
  const out = await fit(context<FitArgs>({ path: "noise.png", size: "100KB", format: "keep" }));
  expect(out.path).toBe("/home/noise-fit.png");
  expect((await files.get_file(out.path))!.size).toBeLessThanOrEqual(100_000);
  const [width, height] = await dimensions(out.path);
  expect(width).toBeLessThan(400);
  expect(width / height).toBeCloseTo(2, 1);
});

test("an image already under the limit is copied byte for byte", async () => {
  const size = await seed_noise("small.jpg", 64, 64, "image/jpeg");
  const out = await fit(context<FitArgs>({ path: "small.jpg", size: "1MB", format: "keep" }));
  expect((await files.get_file(out.path))!.size).toBe(size);
});

test("a limit nothing reaches is an error, not a file", async () => {
  await seed_noise("noise.png", 64, 64);
  await expect(fit(context<FitArgs>({ path: "noise.png", size: "10", format: "keep" }))).rejects.toThrow(/couldn't get under/);
});

test("squash --under fits every copy, -q the highest quality", async () => {
  await seed_noise("a.png", 300, 300);
  await seed_noise("b.png", 200, 100);
  const out = await squash(
    context<SquashArgs>({ paths: ["a.png", "b.png"], format: "webp", quality: 80, under: "20KB", floor: 40 })
  );
  expect(out.map((value) => value.path)).toEqual(["/home/a-squashed.webp", "/home/b-squashed.webp"]);
  for (const value of out) expect((await files.get_file(value.path))!.size).toBeLessThanOrEqual(20_000);
});

test("squash refuses an --under that isn't a size", async () => {
  await seed_noise("a.png", 10, 10);
  await expect(squash(context<SquashArgs>({ paths: ["a.png"], format: "webp", quality: 80, under: "lots", floor: 50 }))).rejects.toThrow(
    "give the size"
  );
});
