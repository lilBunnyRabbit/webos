import { beforeEach, describe, expect, test } from "vitest";
import * as opfs from "$lib/core/api/services/files/opfs";
import { FilesService } from "$lib/core/api/services/files/service.svelte";
import { open_latest } from "./file-explorer-history";

let files: FilesService;

beforeEach(async () => {
  await opfs.clear_opfs();
  files = new FilesService();
  await files.init();
});

describe("open_latest", () => {
  test("opens the newest folder and returns the stack below it", async () => {
    const found = await open_latest(files, [["home"], ["etc"], ["var"]]);
    expect(found?.next.path).toBe("/var");
    expect(found?.rest).toEqual([["home"], ["etc"]]);
    found?.next.dispose();
  });

  test("skips folders that are gone and drops them from the stack", async () => {
    await files.create_directory(await files.get_directory("/home"), "gone");
    const stack = [["home"], ["etc"], ["home", "gone"]];
    await (await files.get_directory("/home"))!.removeEntry("gone");

    const found = await open_latest(files, stack);
    expect(found?.next.path).toBe("/etc");
    expect(found?.rest).toEqual([["home"]]);
    found?.next.dispose();
  });

  test("is null when nothing in the stack exists", async () => {
    expect(await open_latest(files, [["nope"], ["home", "nope"]])).toBeNull();
    expect(await open_latest(files, [])).toBeNull();
  });
});
