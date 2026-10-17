import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import kernel from "$lib/core/api";
import { stub_service } from "$lib/core/api/kernel/test-kernel";
import { clear_opfs } from "$lib/core/api/services/files/opfs";
import { FilesService } from "$lib/core/api/services/files/service.svelte";
import { NotificationsService } from "$lib/core/api/services/notifications/service.svelte";
import { BRAND_DARK } from "$lib/core/api/services/settings/themes";
import type { CommandContext } from "$lib/core/api/services/shell/type";
import { entry_blob, read_zip } from "$lib/core/utils/zip/read";
import { icons, type IconsArgs } from "./shell";

let files: FilesService;
let notifications: NotificationsService;

beforeAll(() => {
  files = new FilesService();
  notifications = new NotificationsService();
  kernel.services.set("files", files);
  kernel.services.set("notifications", notifications);
  kernel.services.set("settings", stub_service("settings", { theme: BRAND_DARK }));
});

beforeEach(async () => {
  await clear_opfs();
  await files.init();
});

afterAll(() => {
  notifications.destroy();
  kernel.services.delete("files");
  kernel.services.delete("notifications");
  kernel.services.delete("settings");
});

function context(args: Partial<IconsArgs> & { path: string }) {
  return {
    args: { padding: "0%", ...args },
    input: (async function* () {})(),
    piped: false,
    session: { cwd: "/home" },
    signal: new AbortController().signal,
    elevated: false,
  } as unknown as CommandContext<IconsArgs>;
}

async function seed(name: string, content: string | Blob) {
  await files.create_file((await files.get_directory("/home"))!, name, { content, overwrite: true });
}

const LOGO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect x="2" y="2" width="6" height="6" fill="#ff0000"/></svg>`;

async function decode(blob: Blob) {
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
  const pixel = (x: number, y: number) => Array.from(canvas.getContext("2d")!.getImageData(x, y, 1, 1).data);
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return { ...size, pixel };
}

test("zips the whole pack next to an SVG", async () => {
  await seed("logo.svg", LOGO);
  const value = await icons(context({ path: "logo.svg", bg: "#0000ff", padding: "10%" }));
  expect(value.path).toBe("/home/logo-icons.zip");

  const zip = (await files.get_file(value.path))!;
  const archive = await read_zip(zip);
  const names = archive.entries.map((entry) => entry.name).sort();
  expect(names).toEqual(
    [
      "apple-touch-icon.png",
      "favicon.ico",
      "favicon.svg",
      "head.html",
      "icon-192.png",
      "icon-512.png",
      "manifest.webmanifest",
      "maskable-512.png",
      "og.png",
    ].sort()
  );
  const entry = async (name: string) => entry_blob(zip, archive.entries.find((item) => item.name === name)!, {});

  const icon = await decode(await entry("icon-512.png"));
  expect([icon.width, icon.height]).toEqual([512, 512]);
  expect(icon.pixel(256, 256)).toEqual([255, 0, 0, 255]);
  expect(icon.pixel(4, 4)).toEqual([0, 0, 255, 255]);

  const card = await decode(await entry("og.png"));
  expect([card.width, card.height]).toEqual([1200, 630]);

  const ico = new DataView(await (await entry("favicon.ico")).arrayBuffer());
  expect(ico.getUint16(4, true)).toBe(3);
  expect([ico.getUint8(6), ico.getUint8(22), ico.getUint8(38)]).toEqual([16, 32, 48]);

  const manifest = JSON.parse(await (await entry("manifest.webmanifest")).text());
  expect(manifest.theme_color).toBe("#0000ff");
  expect(await (await entry("favicon.svg")).text()).toContain(`fill="#0000ff"`);
});

test("keeps the favicons transparent without --bg, writes into --to and takes a free name", async () => {
  await seed("logo.svg", LOGO);
  await files.create_directory((await files.get_directory("/home"))!, "out");
  const first = await icons(context({ path: "logo.svg", to: "out" }));
  const second = await icons(context({ path: "logo.svg", to: "out" }));
  expect(first.path).toBe("/home/out/logo-icons.zip");
  expect(second.path).toBe("/home/out/logo-icons (1).zip");

  const zip = (await files.get_file(first.path))!;
  const archive = await read_zip(zip);
  const blob = await entry_blob(zip, archive.entries.find((item) => item.name === "icon-192.png")!, {});
  expect((await decode(blob)).pixel(2, 2)[3]).toBe(0);
});

test("refuses a bad padding and a file that isn't an image", async () => {
  await seed("logo.svg", LOGO);
  await seed("notes.txt", "hi");
  await expect(icons(context({ path: "logo.svg", padding: "90%" }))).rejects.toThrow(/padding/);
  await expect(icons(context({ path: "notes.txt" }))).rejects.toThrow(/not an SVG or an image/);
  await expect(icons(context({ path: "missing.svg" }))).rejects.toThrow(/no such file/);
});
