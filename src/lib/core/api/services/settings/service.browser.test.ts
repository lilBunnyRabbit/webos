import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { boot_test_kernel } from "../../kernel/test-kernel";
import * as opfs from "../files/opfs";
import { FilesService } from "../files/service.svelte";
import { WALLPAPER_DIRECTORY } from "./persistence";
import { SettingsService } from "./service.svelte";

let shutdown: () => void;

beforeEach(() => vi.waitFor(() => opfs.clear_opfs()));
afterEach(() => shutdown?.());

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
