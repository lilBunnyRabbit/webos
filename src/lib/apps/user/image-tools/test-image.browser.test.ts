import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import kernel from "$lib/core/api";
import { clear_opfs } from "$lib/core/api/services/files/opfs";
import { FilesService } from "$lib/core/api/services/files/service.svelte";
import { NotificationsService } from "$lib/core/api/services/notifications/service.svelte";
import type { CommandContext } from "$lib/core/api/services/shell/type";
import { TasksService } from "$lib/core/api/services/tasks/service.svelte";
import { testimg, type TestImgArgs } from "./shell";
import { DEFAULT_OUTPUT, DEFAULT_SPEC, fill_base, Pattern, TestFormat, type TestImageSpec, type TestOutput } from "./test-image";
import { generate_test_image } from "./test-image-job";

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

const plain = (patch: Partial<TestImageSpec> = {}): TestImageSpec => ({
  ...DEFAULT_SPEC,
  border: 0,
  rulers: 0,
  crosshair: false,
  corners: false,
  label: "",
  ...patch,
});

async function pixels_of(path: string): Promise<{ width: number; height: number; data: Uint8ClampedArray }> {
  const bitmap = await createImageBitmap((await files.get_file(path))!);
  const context = new OffscreenCanvas(bitmap.width, bitmap.height).getContext("2d")!;
  context.drawImage(bitmap, 0, 0);
  const { width, height } = bitmap;
  bitmap.close();
  return { width, height, data: context.getImageData(0, 0, width, height).data };
}

function expected(spec: TestImageSpec): Uint8ClampedArray {
  const pixels = new Uint32Array(spec.width * spec.height);
  fill_base(pixels, spec, { x: 0, y: 0, columns: spec.width, rows: spec.height, scale: 1 });
  return new Uint8ClampedArray(pixels.buffer);
}

// toEqual on tens of megabytes of pixels takes the test page down; the first differing pixel says more anyway.
function first_difference(actual: Uint8ClampedArray, wanted: Uint8ClampedArray, width: number): string | null {
  if (actual.length !== wanted.length) return `length ${actual.length} vs ${wanted.length}`;
  for (let index = 0; index < actual.length; index++) {
    if (actual[index] !== wanted[index]) {
      const pixel = Math.floor(index / 4);
      return `pixel ${pixel % width},${Math.floor(pixel / width)}: ${actual.slice(pixel * 4, pixel * 4 + 4)} vs ${wanted.slice(pixel * 4, pixel * 4 + 4)}`;
    }
  }
  return null;
}

async function generate(spec: TestImageSpec, output: Partial<TestOutput>, path: string) {
  const result = await generate_test_image("image-tools", spec, { ...DEFAULT_OUTPUT, ...output }, path);
  if (!result.ok) throw new Error(result.error);
  return result;
}

test("streamed PNG and BMP decode in the browser to exactly the pattern", async () => {
  const spec = plain({ width: 300, height: 200, cell: 7 });
  for (const format of [TestFormat.PNG, TestFormat.BMP]) {
    const target = format === TestFormat.PNG ? 200_000 : 180_000;
    const result = await generate(spec, { format, target }, `/home/a.${format}`);
    expect(result.size).toBe(target);
    expect((await files.get_file(result.path))!.size).toBe(target);
    const sized = { ...spec, width: result.width, height: result.height };
    const decoded = await pixels_of(result.path);
    expect(decoded).toMatchObject({ width: result.width, height: result.height });
    expect(first_difference(decoded.data, expected(sized), sized.width)).toBeNull();
  }
});

test("streaming draws bands and tiles that line up across their edges", async () => {
  const spec = plain({ width: 5000, height: 2000, cell: 3, pattern: Pattern.RINGS });
  const result = await generate(spec, { format: TestFormat.BMP }, "/home/wide.bmp");
  const decoded = await pixels_of(result.path);
  expect(first_difference(decoded.data, expected(spec), spec.width)).toBeNull();
});

test("canvas formats and SVG keep the requested size", async () => {
  const spec = { ...DEFAULT_SPEC, width: 640, height: 360 };
  for (const format of [TestFormat.PNG, TestFormat.JPEG, TestFormat.WEBP, TestFormat.SVG]) {
    const result = await generate(spec, { format }, `/home/b.${format}`);
    const file = (await files.get_file(result.path))!;
    expect(file.size).toBeGreaterThan(0);
    const bitmap = await createImageBitmap(format === TestFormat.SVG ? await svg_bitmap_source(file) : file);
    expect([bitmap.width, bitmap.height]).toEqual([640, 360]);
    bitmap.close();
  }
});

async function svg_bitmap_source(file: File): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = URL.createObjectURL(file);
  await image.decode();
  return image;
}

test("cancel stops the run and leaves no file", async () => {
  const controller = new AbortController();
  const run = generate_test_image("image-tools", plain({ width: 4000, height: 4000 }), { ...DEFAULT_OUTPUT, format: TestFormat.BMP }, "/home/c.bmp", controller.signal);
  setTimeout(() => controller.abort(), 30);
  expect(await run).toEqual({ ok: false, error: "stopped" });
  expect(await files.get_file("/home/c.bmp")).toBeNull();
});

const context = (args: Partial<TestImgArgs>) =>
  ({
    args: { pattern: "rings", pixel: 24, quality: 92, grid: false, plain: false, ...args },
    input: (async function* () {})(),
    piped: false,
    session: { cwd: "/home" },
    signal: new AbortController().signal,
    elevated: false,
  }) as unknown as CommandContext<TestImgArgs>;

test("testimg saves into /home/Pictures under a free name, or where --to says", async () => {
  const first = await testimg(context({ dimensions: "64x48" }));
  expect(first).toMatchObject({ $type: "file", path: "/home/Pictures/test-rings-64x48.png" });
  const again = await testimg(context({ dimensions: "64x48" }));
  expect(again.path).toBe("/home/Pictures/test-rings-64x48 (1).png");

  const named = await testimg(context({ dimensions: "64x48", to: "shot.webp" }));
  expect(named.path).toBe("/home/shot.webp");
  expect((await files.get_file(named.path))!.type).toBe("image/webp");

  const into = await testimg(context({ dimensions: "10x10", to: "/home", format: TestFormat.BMP, pattern: "noise" }));
  expect(into.path).toBe("/home/test-noise-10x10.bmp");
});

test("testimg --size writes exactly that many bytes", async () => {
  const out = await testimg(context({ size: "1MB" }));
  expect(out.size).toBe(1024 * 1024);
  expect(out.path).toMatch(/^\/home\/Pictures\/test-rings-\d+x\d+\.png$/);
});

test("testimg explains bad input", async () => {
  await expect(testimg(context({ dimensions: "big" }))).rejects.toThrow(/WxH/);
  await expect(testimg(context({ size: "lots" }))).rejects.toThrow(/500MB/);
  await expect(testimg(context({ size: "1MB", format: TestFormat.JPEG }))).rejects.toThrow(/PNG or BMP/);
});
