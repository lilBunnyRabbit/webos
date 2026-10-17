import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import kernel from "$lib/core/api";
import { clear_opfs } from "$lib/core/api/services/files/opfs";
import { FilesService } from "$lib/core/api/services/files/service.svelte";
import type { CommandContext } from "$lib/core/api/services/shell/type";
import { component, optimize, png } from "./shell";

const ICON = `<?xml version="1.0"?>
<!-- an editor wrote this -->
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="12" viewBox="0 0 24 12">
  <path fill="#000000" d="M 0.000000 0.000000 L 24.000000 0.000000 L 24.000000 12.000000 Z"/>
</svg>`;

let files: FilesService;

beforeAll(() => {
  files = new FilesService();
  kernel.services.set("files", files);
});

beforeEach(async () => {
  await clear_opfs();
  await files.init();
  await files.create_file(await files.get_directory("/home"), "icon.svg", { content: ICON, overwrite: true });
});

afterAll(() => {
  kernel.services.delete("files");
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

const text = async (path: string) => (await files.get_file(path))!.text();

test("svg optimize writes name.min.svg beside the original, then a free name", async () => {
  const first = await optimize(context({ path: "icon.svg", precision: 3 }));
  expect(first.path).toBe("/home/icon.min.svg");
  const written = await text(first.path);
  expect(written).not.toContain("<?xml");
  expect(written.length).toBeLessThan(ICON.length);
  expect((await optimize(context({ path: "icon.svg", precision: 3 }))).path).toBe("/home/icon.min (1).svg");
});

test("svg optimize -o replaces a file or fills a folder", async () => {
  await files.create_file(await files.get_directory("/home"), "out.svg", { content: "old", overwrite: true });
  expect((await optimize(context({ path: "icon.svg", out: "out.svg", precision: 3 }))).path).toBe("/home/out.svg");
  expect(await text("/home/out.svg")).toContain("<svg");
  expect((await optimize(context({ path: "icon.svg", out: "Documents", precision: 3 }))).path).toBe("/home/Documents/icon.min.svg");
});

test("svg optimize refuses system folders and missing or broken files", async () => {
  await expect(optimize(context({ path: "icon.svg", out: "/etc/x.svg", precision: 3 }))).rejects.toThrow(/read-only/);
  await expect(optimize(context({ path: "nope.svg", precision: 3 }))).rejects.toThrow(/no such file/);
  await files.create_file(await files.get_directory("/home"), "broken.svg", { content: "<svg><g></svg>", overwrite: true });
  await expect(optimize(context({ path: "broken.svg", precision: 3 }))).rejects.toThrow(/broken\.svg/);
});

test("svg png renders the longest side at --size", async () => {
  const value = await png(context({ path: "icon.svg", size: 64 }));
  expect(value.path).toBe("/home/icon-64.png");
  const bitmap = await createImageBitmap((await files.get_file(value.path))!);
  expect([bitmap.width, bitmap.height]).toEqual([64, 32]);
  const pixels = new OffscreenCanvas(64, 32).getContext("2d")!;
  pixels.drawImage(bitmap, 0, 0);
  expect(pixels.getImageData(60, 2, 1, 1).data[3]).toBe(255);
  expect(pixels.getImageData(2, 30, 1, 1).data[3]).toBe(0);
});

test("svg component writes a recoloured Svelte component", async () => {
  const value = await component(context({ path: "icon.svg", size: 16, colors: false }));
  expect(value.path).toBe("/home/Icon.svelte");
  const source = await text(value.path);
  expect(source).toContain('color = "currentColor"');
  expect(source).toContain("fill={color}");
  expect(source).not.toContain("#000");

  const kept = await component(context({ path: "icon.svg", out: "Kept.svelte", size: 16, colors: true }));
  expect(await text(kept.path)).not.toContain("{color}");
});
