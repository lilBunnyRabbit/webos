import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { boot_test_kernel } from "../../kernel/test-kernel";
import * as opfs from "../files/opfs";
import { FilesService } from "../files/service.svelte";
import { flushSync } from "svelte";
import { DEFAULT_TURRETS_OPTIONS } from "$lib/core/components/desktop/live/turrets/options";
import { SETTINGS_PATH, SETTINGS_VERSION, WALLPAPER_DIRECTORY } from "./persistence";
import { SettingsService } from "./service.svelte";

let shutdown: () => Promise<void>;

beforeEach(() => vi.waitFor(() => opfs.clear_opfs()));
afterEach(async () => await shutdown?.());

async function boot() {
  const booted = await boot_test_kernel({ files: FilesService, settings: SettingsService });
  shutdown = booted.shutdown;
  return { files: booted.kernel.service<FilesService>("files"), settings: booted.kernel.service<SettingsService>("settings") };
}

async function wallpaper_files(files: FilesService): Promise<string[]> {
  const directory = await files.get_directory(WALLPAPER_DIRECTORY);
  return directory ? (await files.list(directory)).map((item) => item.name) : [];
}

test("an image becomes a copy the OS owns, and replacing it deletes the old copy", async () => {
  const { files, settings } = await boot();
  const home = await files.get_directory("/home");
  await files.create_file(home, "beach.png", { content: new Blob(["one"], { type: "image/png" }) });

  await settings.set_wallpaper_image("/home/beach.png");
  const first = settings.wallpaper.kind === "image" ? settings.wallpaper.path : "";
  expect(first.startsWith(`${WALLPAPER_DIRECTORY}/`)).toBe(true);
  expect(await (await files.get_file(first))?.text()).toBe("one");

  await files.delete_entry(home, "beach.png");
  expect(await files.get_file(first)).not.toBeNull();

  settings.wallpaper = { ...settings.wallpaper, dim: 0.3 } as typeof settings.wallpaper;
  await settings.set_wallpaper_image(new File(["two"], "city.png", { type: "image/png" }));
  expect(settings.wallpaper).toMatchObject({ kind: "image", dim: 0.3 });
  expect(await wallpaper_files(files)).toEqual([settings.wallpaper.kind === "image" ? settings.wallpaper.path.split("/").pop() : ""]);
});

test("a live wallpaper and its options survive a reboot", async () => {
  const { files, settings } = await boot();
  settings.wallpaper = { kind: "live", id: "turrets" };
  settings.live_options = { turrets: { ...DEFAULT_TURRETS_OPTIONS, mode: "follow", pace: "frantic" } };
  flushSync();
  await vi.waitFor(async () => expect(await (await files.get_file(SETTINGS_PATH))?.text()).toContain('"frantic"'), { timeout: 3000 });
  await shutdown();

  const again = await boot();
  expect(again.settings.wallpaper).toEqual({ kind: "live", id: "turrets" });
  expect(again.settings.live_options.turrets).toEqual({ ...DEFAULT_TURRETS_OPTIONS, mode: "follow", pace: "frantic" });
});

test("an unknown live wallpaper loads as the grid, and broken options fall back per field", async () => {
  const etc = await (await opfs.get_root()).getDirectoryHandle("etc", { create: true });
  const saved = { version: SETTINGS_VERSION, wallpaper: { kind: "live", id: "gone" }, live_options: { turrets: { mode: "sideways", pace: "chill" }, gone: { x: 1 } } };
  await opfs.write_file(await etc.getFileHandle("settings.json", { create: true }), JSON.stringify(saved));

  const { settings } = await boot();
  expect(settings.wallpaper).toEqual({ kind: "preset", preset: "grid" });
  expect(settings.live_options).toEqual({ turrets: { ...DEFAULT_TURRETS_OPTIONS, pace: "chill" } });
});
