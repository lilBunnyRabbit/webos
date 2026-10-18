import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import kernel from "$lib/core/api";
import { clear_opfs } from "$lib/core/api/services/files/opfs";
import { FilesService } from "$lib/core/api/services/files/service.svelte";
import { NotificationsService } from "$lib/core/api/services/notifications/service.svelte";
import type { CommandContext } from "$lib/core/api/services/shell/type";
import { TasksService } from "$lib/core/api/services/tasks/service.svelte";
import { decode, encode } from "$kit/utils/codecs";
import { is_avif, is_jxl } from "$kit/utils/codecs/formats";
import { parse_header } from "./header";
import { convert, type ConvertArgs } from "./shell";

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

function context(args: Partial<ConvertArgs>) {
  return {
    args: { paths: [], to: "webp", ...args },
    input: (async function* () {})(),
    piped: false,
    session: { cwd: "/home" },
    signal: new AbortController().signal,
    elevated: false,
  } as unknown as CommandContext<ConvertArgs>;
}

function stripes(width: number, height: number, alpha = 255): ImageData {
  const image = new ImageData(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      image.data.set([(x * 7) % 256, (y * 5) % 256, x % 16 < 8 ? 30 : 200, alpha], offset);
    }
  }
  return image;
}

async function seed(folder: string, name: string, width: number, height: number) {
  const canvas = new OffscreenCanvas(width, height);
  canvas.getContext("2d")!.putImageData(stripes(width, height), 0, 0);
  const directory = (await files.get_directory(folder))!;
  await files.create_file(directory, name, { content: await canvas.convertToBlob({ type: "image/png" }), overwrite: true });
}

async function head_of(path: string) {
  return new Uint8Array(await (await files.get_file(path))!.arrayBuffer());
}

test("writes name.avif beside the source and never over an existing file", async () => {
  await seed("/home", "photo.png", 48, 32);
  await files.create_file((await files.get_directory("/home"))!, "photo.avif", { content: "taken" });
  const out = await convert(context({ paths: ["photo.png"], to: "avif", quality: 40 }));
  expect(out.map((value) => value.path)).toEqual(["/home/photo (1).avif"]);
  expect(is_avif(await head_of("/home/photo (1).avif"))).toBe(true);
  expect(await (await files.get_file("/home/photo.avif"))!.text()).toBe("taken");
}, 60_000);

test("converts every image in a folder to JPEG XL into --out", async () => {
  const home = (await files.get_directory("/home"))!;
  await files.create_directory(home, "shots");
  await files.create_directory(home, "out");
  await seed("/home/shots", "one.png", 40, 40);
  await seed("/home/shots", "two.png", 24, 16);
  await files.create_file((await files.get_directory("/home/shots"))!, "notes.txt", { content: "hi" });
  const out = await convert(context({ paths: ["shots"], to: "jxl", out: "out" }));
  expect(out.map((value) => value.path)).toEqual(["/home/out/one.jxl", "/home/out/two.jxl"]);
  const decoded = await decode((await files.get_file("/home/out/two.jxl"))!);
  expect([decoded.width, decoded.height]).toEqual([24, 16]);
  expect(is_jxl(await head_of("/home/out/one.jxl"))).toBe(true);
}, 60_000);

test("reads a JPEG XL source back", async () => {
  const { blob } = await encode("jxl", stripes(20, 12));
  await files.create_file((await files.get_directory("/home"))!, "art.jxl", { content: blob });
  const out = await convert(context({ paths: ["art.jxl"], to: "png" }));
  expect(out[0].path).toBe("/home/art.png");
  expect((await files.get_file("/home/art.png"))!.type).toBe("image/png");
}, 60_000);

test("refuses a file that isn't an image", async () => {
  await files.create_file((await files.get_directory("/home"))!, "notes.txt", { content: "hi" });
  await expect(convert(context({ paths: ["notes.txt"] }))).rejects.toThrow("not an image");
});

test("parses the header of an AVIF with alpha", async () => {
  const { blob } = await encode("avif", stripes(30, 20, 128), { quality: 50 });
  const header = parse_header(new Uint8Array(await blob.arrayBuffer()));
  expect(header).toMatchObject({ format: "AVIF", width: 30, height: 20, bit_depth: 8, alpha: true, animated: false, hdr: false });
}, 60_000);

test("parses the header of a JPEG XL, lossy and lossless", async () => {
  const lossy = parse_header(new Uint8Array(await (await encode("jxl", stripes(33, 21))).blob.arrayBuffer()));
  // jSquash always writes the alpha channel, opaque or not: the header is right to say it has one.
  expect(lossy).toMatchObject({ format: "JPEG XL", width: 33, height: 21, bit_depth: 8, alpha: true, animated: false, hdr: false });
  expect(lossy?.extra).toContainEqual({ label: "Mode", value: "lossy (XYB)" });
  const lossless = parse_header(new Uint8Array(await (await encode("jxl", stripes(64, 48, 100), { lossless: true })).blob.arrayBuffer()));
  expect(lossless).toMatchObject({ width: 64, height: 48, alpha: true });
  expect(lossless?.extra).toContainEqual({ label: "Mode", value: "lossless or modular" });
}, 60_000);
