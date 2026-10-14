import { flushSync } from "svelte";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { z } from "zod";
import kernel from "$lib/core/api";
import { FilesService } from "$lib/core/api/services/files/service.svelte";
import { app_data_path, json_file } from "./json-file.svelte";

const Schema = z.object({ count: z.number() });
let files: FilesService;

beforeAll(async () => {
  files = new FilesService();
  await files.init();
  kernel.services.set("files", files);
});

afterAll(() => {
  kernel.services.delete("files");
});

async function read(path: string): Promise<string | null> {
  return (await (await files.get_file(path))?.text()) ?? null;
}

async function write(path: string, text: string): Promise<void> {
  const directory = await files.get_directory(path.slice(0, path.lastIndexOf("/")));
  await files.create_file(directory, path.slice(path.lastIndexOf("/") + 1), { content: text, overwrite: true });
}

describe("json_file", () => {
  test("starts at initial, writes changes, and shares one cell per path", async () => {
    const path = app_data_path("json-test", "a.json");
    const one = json_file(path, { count: 0 }, Schema);
    await vi.waitFor(() => expect(one.ready).toBe(true));
    expect(one.value).toEqual({ count: 0 });
    expect(await read(path)).toBeNull();

    const two = json_file(path, { count: 99 }, Schema);
    one.value.count = 3;
    flushSync();
    expect(two.value.count).toBe(3);
    await vi.waitFor(async () => expect(JSON.parse((await read(path))!)).toEqual({ count: 3 }));

    one.release();
    two.release();
  });

  test("reloads when the file changes on disk", async () => {
    const path = app_data_path("json-test", "b.json");
    const cell = json_file(path, { count: 0 }, Schema);
    await vi.waitFor(() => expect(cell.ready).toBe(true));
    await write(path, JSON.stringify({ count: 7 }));
    await vi.waitFor(() => expect(cell.value.count).toBe(7));
    cell.release();
  });

  test("keeps an invalid file until the next change", async () => {
    const path = app_data_path("json-test", "c.json");
    await write(path, "{ nope");
    const cell = json_file(path, { count: 1 }, Schema);
    await vi.waitFor(() => expect(cell.ready).toBe(true));
    expect(cell.error).toMatch(/Invalid JSON/);
    expect(cell.value.count).toBe(1);
    expect(await read(path)).toBe("{ nope");

    cell.value.count = 2;
    flushSync();
    await vi.waitFor(async () => expect(JSON.parse((await read(path))!)).toEqual({ count: 2 }));
    cell.release();
  });

  test("saves a change made right before release", async () => {
    const path = app_data_path("json-test", "d.json");
    const cell = json_file(path, { count: 0 }, Schema);
    await vi.waitFor(() => expect(cell.ready).toBe(true));
    cell.value.count = 5;
    cell.release();
    await vi.waitFor(async () => expect(JSON.parse((await read(path))!)).toEqual({ count: 5 }));
  });
});
