import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { AppsService, Kernel } from "$lib/core/api";
import * as opfs from "../files/opfs";
import { FilesService } from "../files/service.svelte";
import { write_var_lib } from "./folder.svelte";
import { HOME_LAYOUT_FILE, HOME_LAYOUT_PATH } from "./home-layout";
import { LAYOUT_DIRECTORY_NAME } from "./layout";
import { MobileDesktopService } from "./mobile.svelte";

let files: FilesService;
let desktop: MobileDesktopService;

beforeEach(async () => {
  await opfs.clear_opfs();
  files = new FilesService();
  await files.init();
});

afterEach(() => desktop?.destroy());

function create(get: (id: string) => unknown = () => undefined) {
  const apps = { get } as unknown as AppsService;
  const kernel = { service: (key: string) => (key === "files" ? files : apps) } as unknown as Kernel;
  return new MobileDesktopService(kernel);
}

test("a saved dock joins the end of the home order once and leaves the file", async () => {
  const home = (await files.get_directory("/home/Desktop"))!;
  for (const name of ["a", "b", "c", "d"]) await files.create_directory(home, name);
  const legacy = { version: 1, order: ["c", "b"], dock: ["a", "b"] };
  await write_var_lib(files, LAYOUT_DIRECTORY_NAME, HOME_LAYOUT_FILE, JSON.stringify(legacy));

  desktop = create();
  await desktop.init();

  expect(desktop.home().map((item) => item.name)).toEqual(["c", "b", "a", "d"]);
  await vi.waitFor(async () => expect(JSON.parse((await (await files.get_file(HOME_LAYOUT_PATH))!.text()))).toEqual({ version: 1, order: ["c", "b", "a"] }));
});

test("resize_widget clamps into the app's widget_size and writes the shared .widget file", async () => {
  const manifest = { widget: async () => ({}), widget_size: { min: { w: 2, h: 1 }, max: { w: 4, h: 3 }, default: { w: 3, h: 1 } } };
  desktop = create((id) => (id === "notes" ? manifest : undefined));
  await desktop.init();
  const name = (await desktop.pin_widget("notes", { label: "Notes" }))!;
  await files.create_directory((await files.get_directory("/home/Desktop"))!, "folder");
  await vi.waitFor(() => expect(desktop.names()).toContain("folder"));

  expect(await desktop.resize_widget(name, { w: 3, h: 9 })).toBe(true);
  expect(desktop.home().find((item) => item.name === name)).toMatchObject({ size: { w: 3, h: 3 } });
  await vi.waitFor(async () => expect(JSON.parse((await (await files.get_file(`/home/Desktop/${name}`))!.text()))).toMatchObject({ app: "notes", w: 3, h: 3 }));

  expect(await desktop.resize_widget("folder", { w: 2, h: 2 })).toBe(false);
});
