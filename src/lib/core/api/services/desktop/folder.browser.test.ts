import { flushSync } from "svelte";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { AppsService } from "$lib/core/api";
import * as opfs from "../files/opfs";
import { FilesService } from "../files/service.svelte";
import { DesktopFolder } from "./folder.svelte";

let folder: DesktopFolder;
let files: FilesService;

beforeEach(async () => {
  await opfs.clear_opfs();
  files = new FilesService();
  await files.init();
});

afterEach(() => folder?.destroy());

test("reloads after a change without reading the layout file again", async () => {
  // A second read would race the owner's own layout writes (NotReadableError / NotFoundError on a desktop drop).
  const read_layout = vi.fn(async () => "{}");
  const loaded = vi.fn();
  folder = new DesktopFolder({
    files: () => files,
    apps: () => ({ get: () => undefined }) as unknown as AppsService,
    read_layout,
    seed: async () => {},
    loaded,
  });
  await folder.init();

  await files.import_entries("/home/Desktop", [new File(["x"], "dropped.txt")]);
  flushSync();
  await vi.waitFor(() => expect(folder.names()).toEqual(["dropped.txt"]));

  expect(read_layout).toHaveBeenCalledTimes(1);
  expect(loaded).toHaveBeenCalledTimes(1);
});
