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

function create() {
  const apps = { get: () => undefined } as unknown as AppsService;
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
