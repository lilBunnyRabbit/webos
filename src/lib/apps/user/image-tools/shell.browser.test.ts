import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import kernel from "$lib/core/api";
import { clear_opfs } from "$lib/core/api/services/files/opfs";
import { FilesService } from "$lib/core/api/services/files/service.svelte";
import { file_value } from "$lib/core/api/services/files/shell";
import { NotificationsService } from "$lib/core/api/services/notifications/service.svelte";
import { TasksService } from "$lib/core/api/services/tasks/service.svelte";
import type { CommandContext, Value } from "$lib/core/api/services/shell/type";
import { load_pdf } from "$lib/apps/user/pdf-tools/pdf";
import { join, poster, split, trim, unbg } from "./shell";

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

function context<T>(args: T, piped: Value[] = []) {
  return {
    args,
    input: (async function* () {
      yield* piped;
    })(),
    piped: piped.length > 0,
    session: { cwd: "/home" },
    signal: new AbortController().signal,
    elevated: false,
  } as unknown as CommandContext<T>;
}

async function seed(
  name: string,
  width: number,
  height: number,
  rect = { x: 0, y: 0, w: width, h: height },
  fill = "#ff0000"
) {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = fill;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  const home = await files.get_directory("/home");
  await files.create_file(home, name, { content: await canvas.convertToBlob({ type: "image/png" }), overwrite: true });
}

async function size_of(path: string) {
  const bitmap = await createImageBitmap((await files.get_file(path))!);
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return size;
}

async function alpha_at(path: string, x: number, y: number): Promise<number> {
  const bitmap = await createImageBitmap((await files.get_file(path))!);
  const ctx = new OffscreenCanvas(bitmap.width, bitmap.height).getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return ctx.getImageData(x, y, 1, 1).data[3];
}

test("image trim cuts transparent borders and writes next to the original under a free name", async () => {
  await seed("a.png", 10, 10, { x: 2, y: 3, w: 4, h: 3 });

  const [first] = await trim(context({ paths: ["a.png"], alpha: 0 }));
  expect(first).toMatchObject({ $type: "file", path: "/home/a-cropped.png" });
  expect(await size_of(first.path)).toEqual({ width: 4, height: 3 });

  const [second] = await trim(context({ paths: ["~/a.png"], alpha: 0 }));
  expect(second.path).toBe("/home/a-cropped (1).png");
});

test("image split writes square tiles into a folder next to the image", async () => {
  await seed("b.png", 300, 200);

  const tiles = await split(context({ path: "b.png", cols: 3 }));
  expect(tiles.map((tile) => tile.path)).toEqual([1, 2, 3, 4, 5, 6].map((n) => `/home/b-split/b_${n}.png`));
  expect(await size_of(tiles[0].path)).toEqual({ width: 100, height: 100 });

  const again = await split(context({ path: "b.png", rows: 1 }));
  expect(again.map((tile) => tile.path)).toEqual([1, 2].map((n) => `/home/b-split (1)/b_${n}.png`));

  await expect(split(context({ path: "b.png", cols: 2, rows: 2 }))).rejects.toThrow("--cols or --rows");
  await expect(split(context({ path: "b.png" }))).rejects.toThrow("--cols or --rows");
});

test("image join takes piped files, in order, and writes one PNG next to the first", async () => {
  await seed("c.png", 10, 10);
  await seed("d.png", 20, 5);
  const settings = { direction: "row", gap: 2, align: "start", fit: false, background: "#ffffff", opacity: 0 } as const;

  const out = await join(
    context({ paths: [], ...settings }, [file_value("/home/c.png", "file"), file_value("/home/d.png", "file")])
  );
  expect(out).toMatchObject({ $type: "file", path: "/home/joined.png" });
  expect(await size_of(out.path)).toEqual({ width: 32, height: 10 });

  const stacked = await join(context({ paths: ["c.png", "d.png"], ...settings, direction: "column" }));
  expect(stacked.path).toBe("/home/joined (1).png");
  expect(await size_of(stacked.path)).toEqual({ width: 20, height: 17 });

  await expect(join(context({ paths: ["c.png"], ...settings }))).rejects.toThrow("at least two");
});

test("image unbg clears the given colours and refuses missing files", async () => {
  await seed("e.png", 4, 4, { x: 0, y: 0, w: 2, h: 4 }, "#ffffff");

  const out = await unbg(context({ path: "e.png", color: ["#fff"] }));
  expect(out.path).toBe("/home/e-transparent.png");
  expect(await alpha_at(out.path, 0, 0)).toBe(0);

  await expect(unbg(context({ path: "nope.png", color: ["#fff"] }))).rejects.toThrow("/home/nope.png: no such file");
});

test("poster writes a map plus one page per sheet next to the image, or where -o says", async () => {
  await seed("f.png", 300, 400);
  const args = { path: "f.png", across: 2, paper: "a4", overlap: "10mm", landscape: false } as const;

  const out = await poster(context(args));
  expect(out).toMatchObject({ $type: "file", path: "/home/f-poster.pdf" });
  const document = await load_pdf(new Uint8Array(await (await files.get_file(out.path))!.arrayBuffer()));
  expect(document.getPageCount()).toBe(1 + 2 * 2);
  expect(document.getPage(1).getWidth()).toBeCloseTo(595.28, 1);

  const wide = await poster(context({ ...args, paper: "a3", landscape: true, out: "big" }));
  expect(wide.path).toBe("/home/big.pdf");
  expect((await load_pdf(new Uint8Array(await (await files.get_file(wide.path))!.arrayBuffer()))).getPage(1).getWidth()).toBeCloseTo(1190.55, 1);

  await expect(poster(context({ ...args, overlap: "lots" }))).rejects.toThrow("10mm");
});
