import { flushSync, mount, unmount } from "svelte";
import Host from "./fixtures/json-file-host.svelte";
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
  let directory = await files.get_root();
  for (const segment of path.split("/").filter(Boolean).slice(0, -1)) directory = await directory.getDirectoryHandle(segment, { create: true });
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

  test("a sibling's write doesn't revert a change still being written", async () => {
    const one = json_file(app_data_path("json-race", "one.json"), { count: 0 }, Schema);
    const two = json_file(app_data_path("json-race", "two.json"), { count: 0 }, Schema);
    await vi.waitFor(() => expect(one.ready && two.ready).toBe(true));

    for (let i = 1; i <= 5; i++) {
      one.value.count = i;
      flushSync();
      two.value.count = i * 10;
      flushSync();
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(one.value.count).toBe(5);
    expect(two.value.count).toBe(50);
    await vi.waitFor(async () => {
      expect(JSON.parse((await read(app_data_path("json-race", "one.json")))!)).toEqual({ count: 5 });
      expect(JSON.parse((await read(app_data_path("json-race", "two.json")))!)).toEqual({ count: 50 });
    });
    one.release();
    two.release();
  });

  test("a new file's first change survives a sibling's write", async () => {
    const one = json_file(app_data_path("json-new", "one.json"), { count: 0 }, Schema);
    const two = json_file(app_data_path("json-new", "two.json"), { count: 0 }, Schema);
    await vi.waitFor(() => expect(one.ready && two.ready).toBe(true));
    two.value.count = 1;
    flushSync();
    await vi.waitFor(async () => expect(await read(app_data_path("json-new", "two.json"))).not.toBeNull());

    for (let i = 0; i < 20; i++) {
      one.value.count = i + 1;
      flushSync();
      two.value.count = i + 2;
      flushSync();
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(one.value.count).toBe(20);
    expect(two.value.count).toBe(21);
    one.release();
    two.release();
  });

  test("the first write into a folder that doesn't exist yet sticks", async () => {
    for (const id of ["fresh-a", "fresh-b", "fresh-c"]) {
      const path = app_data_path(`json-${id}`, "data.json");
      const cell = json_file(path, { count: 0 }, Schema);
      await vi.waitFor(() => expect(cell.ready).toBe(true));
      cell.value.count = 7;
      flushSync();
      await vi.waitFor(async () => expect(await read(path)).not.toBeNull());
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(cell.value.count).toBe(7);
      expect(cell.error).toBeNull();
      cell.release();
    }
  });

  test("keeps working when its creator plays an outro while the file changes", async () => {
    const path = app_data_path("json-outro", "data.json");
    const target = document.body.appendChild(document.createElement("div"));
    const props = $state({ path, show: true });
    const host = mount(Host, { target, props });
    const other = json_file(path, { count: 0 }, Schema);
    await vi.waitFor(() => expect(other.ready).toBe(true));
    await new Promise((resolve) => setTimeout(resolve, 50));

    props.show = false;
    flushSync();
    await write(path, JSON.stringify({ count: 3 }));
    await vi.waitFor(() => expect(other.value.count).toBe(3));
    await new Promise((resolve) => setTimeout(resolve, 600));

    other.value.count = 8;
    flushSync();
    await vi.waitFor(async () => expect(JSON.parse((await read(path))!)).toEqual({ count: 8 }), { timeout: 2000 });
    other.release();
    unmount(host);
    target.remove();
  });

  test("a change not yet saved survives a re-read triggered by a sibling", async () => {
    const path = app_data_path("json-unsaved", "data.json");
    const cell = json_file(path, { count: 0 }, Schema);
    await vi.waitFor(() => expect(cell.ready).toBe(true));
    cell.value.count = 6;
    await write(app_data_path("json-unsaved", "sibling.json"), "{}");
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(cell.value.count).toBe(6);
    await vi.waitFor(async () => expect(JSON.parse((await read(path))!)).toEqual({ count: 6 }));
    cell.release();
  });
});
