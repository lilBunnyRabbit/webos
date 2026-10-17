import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import { FilesService } from "$lib/core/api/services/files/service.svelte";
import { read_web_app, url_error, write_web_app } from "./store";
import { DESKTOP_DIR, parse_web_app } from "./web-app";

let files: FilesService;

beforeAll(async () => {
  files = new FilesService();
  await files.init();
});

beforeEach(async () => {
  const directory = await files.get_directory(DESKTOP_DIR);
  if (!directory) return;
  for (const item of await files.list(directory)) {
    if (item.name.endsWith(".webapp")) await files.delete_entry(directory, item.name);
  }
});

describe("web app files", () => {
  test("are written to the desktop under a free name and read back", async () => {
    const app = { name: "Example", url: "https://example.com/" };
    const first = await write_web_app(files, DESKTOP_DIR, app);
    const second = await write_web_app(files, DESKTOP_DIR, app);
    expect(first).toBe(`${DESKTOP_DIR}/Example.webapp`);
    expect(second).toBe(`${DESKTOP_DIR}/Example (1).webapp`);
    expect(parse_web_app((await read_web_app(files, first)) ?? "")).toEqual(app);
  });

  test("a missing file reads as null", async () => {
    expect(await read_web_app(files, `${DESKTOP_DIR}/Nope.webapp`)).toBeNull();
  });

  test("refuse WebOS's own origin", () => {
    expect(url_error(location.href, location.origin)).toMatch(/itself/);
    expect(url_error("example.com", location.origin)).toBeNull();
  });
});
