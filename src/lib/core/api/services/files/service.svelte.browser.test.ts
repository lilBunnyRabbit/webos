import { flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import * as opfs from "./opfs";
import { FilesService, type DirectoryHandler } from "./service.svelte";

let files: FilesService;
const handlers: DirectoryHandler[] = [];

async function open(path: string[]): Promise<DirectoryHandler> {
  const handler = await files.directory(path);
  handlers.push(handler);
  flushSync();
  await vi.waitFor(() => expect(handler.loading).toBe(false));
  return handler;
}

function count_listings(name: string): () => number {
  const entries = FileSystemDirectoryHandle.prototype.entries;
  let count = 0;
  vi.spyOn(FileSystemDirectoryHandle.prototype, "entries").mockImplementation(function (this: FileSystemDirectoryHandle) {
    if (this.name === name) count++;
    return entries.call(this);
  });
  return () => count;
}

beforeEach(async () => {
  await opfs.clear_opfs();
  files = new FilesService();
  await files.init();
});

afterEach(() => {
  for (const handler of handlers.splice(0)) handler.dispose();
  vi.restoreAllMocks();
});

describe("revisions", () => {
  test("a mutation bumps only the directory it touched", async () => {
    const home = (await files.get_directory("/home"))!;
    await files.create_directory(home, "a");
    expect(files.revision("/home")).toBe(1);
    expect(files.revision("/")).toBe(0);
    expect(files.revision("//home/")).toBe(1);
  });

  test("move_file bumps both folders, write_file bumps the parent", async () => {
    const home = (await files.get_directory("/home"))!;
    const tmp = (await files.get_directory("/tmp"))!;
    const file = await files.create_file(home, "a.txt");
    await files.move_file(home, file, tmp);
    expect(files.revision("/home")).toBe(2);
    expect(files.revision("/tmp")).toBe(1);

    await files.write_file(file, "x");
    expect(files.revision("/tmp")).toBe(2);
  });
});

describe("revision watchers", () => {
  test("a folder's watcher ignores other folders getting their first revision", async () => {
    let runs = 0;
    const stop = $effect.root(() => {
      $effect(() => {
        files.revision("/home/Desktop");
        runs++;
      });
    });
    flushSync();
    expect(runs).toBe(1);
    const tmp = (await files.get_directory("/tmp"))!;
    await files.create_directory(tmp, "first-time");
    flushSync();
    expect(runs).toBe(1);
    stop();
  });
});

describe("DirectoryHandler", () => {
  test("lists itself and follows changes made elsewhere", async () => {
    const handler = await open(["home"]);
    const home = (await files.get_directory("/home"))!;
    await files.create_directory(home, "from-elsewhere");
    flushSync();
    await vi.waitFor(() => expect(handler.items.map((item) => item.name)).toContain("from-elsewhere"));
  });

  test("its own mutation lists once, not once per trigger", async () => {
    const handler = await open(["tmp"]);
    const listings = count_listings("tmp");
    await handler.create_directory("a");
    flushSync();
    await vi.waitFor(() => expect(handler.loading).toBe(false));
    expect(listings()).toBe(1);
    expect(handler.items.map((item) => item.name)).toEqual(["a"]);
  });

  test("a relist keeps the objects of unchanged entries", async () => {
    const handler = await open(["tmp"]);
    await handler.create_file("a.txt", { content: "a" });
    await handler.create_file("b.txt", { content: "b" });
    const [a, b] = handler.items;
    await files.write_file(b.handle as FileSystemFileHandle, "changed");
    await handler.create_file("c.txt");
    expect(handler.items.map((item) => item.name)).toEqual(["a.txt", "b.txt", "c.txt"]);
    expect(handler.items[0]).toBe(a);
    expect(handler.items[1]).not.toBe(b);
  });

  test("a reload while one runs for the same revision joins it", async () => {
    const handler = await open(["tmp"]);
    expect(handler.reload()).toBe(handler.reload());
  });

  test("notices when a grandparent is deleted, and stops watching", async () => {
    const tmp = (await files.get_directory("/tmp"))!;
    const outer = await files.create_directory(tmp, "outer");
    await files.create_directory(outer, "inner");
    const handler = await open(["tmp", "outer", "inner"]);

    await files.delete_entry(tmp, "outer", { recursive: true });
    flushSync();
    await vi.waitFor(() => expect(handler.exists).toBe(false));
  });

  test("a sibling change in an ancestor keeps it alive", async () => {
    const tmp = (await files.get_directory("/tmp"))!;
    await files.create_directory(tmp, "here");
    const handler = await open(["tmp", "here"]);

    await files.create_directory(tmp, "sibling");
    flushSync();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(handler.exists).toBe(true);
  });

  test("a folder replaced at the same path counts as gone", async () => {
    const tmp = (await files.get_directory("/tmp"))!;
    await files.create_directory(tmp, "x");
    const handler = await open(["tmp", "x"]);

    await files.delete_entry(tmp, "x", { recursive: true });
    await files.create_directory(tmp, "x");
    flushSync();
    await vi.waitFor(() => expect(handler.exists).toBe(false));
  });
});

describe("move_paths / copy_paths", () => {
  async function file(dir: string, name: string, content = name) {
    const handle = await files.create_file(await files.get_directory(dir), name);
    await files.write_file(handle, content);
  }

  test("moves into the target, keeping both on a clash", async () => {
    const home = (await files.get_directory("/home"))!;
    await files.create_directory(home, "a");
    await files.create_directory(home, "b");
    await file("/home/a", "x.txt", "from a");
    await file("/home/b", "x.txt", "from b");

    const moved = await files.move_paths(["/home/a/x.txt"], "/home/b");
    expect(moved).toEqual(["/home/b/x (1).txt"]);
    expect(await (await files.get_file("/home/b/x (1).txt"))!.text()).toBe("from a");
    expect(await files.get_file("/home/a/x.txt")).toBeNull();
  });

  test("moving into the folder it's in is a no-op; into itself throws", async () => {
    const home = (await files.get_directory("/home"))!;
    await files.create_directory(home, "a");
    await file("/home", "y.txt");

    expect(await files.move_paths(["/home/y.txt"], "/home")).toEqual(["/home/y.txt"]);
    await expect(files.move_paths(["/home/a"], "/home/a")).rejects.toThrow("into itself");
  });

  test("copies folders, and the conflict handler can skip", async () => {
    const home = (await files.get_directory("/home"))!;
    await files.create_directory(home, "a");
    await files.create_directory(home, "b");
    await file("/home/a", "z.txt");
    await file("/home/b", "z.txt");

    expect(await files.copy_paths(["/home/a"], "/home/b")).toEqual(["/home/b/a"]);
    expect(await files.get_file("/home/b/a/z.txt")).not.toBeNull();
    expect(await files.copy_paths(["/home/a/z.txt"], "/home/b", async () => "skip")).toEqual([]);
  });
});

describe("import_entries", () => {
  test("stores files and copies folders, keeping both on a clash", async () => {
    const home = (await files.get_directory("/home"))!;
    await files.create_directory(home, "in");
    await files.write_file(await files.create_file(await files.get_directory("/home/in"), "a.txt"), "old");

    // A directory handle from anywhere works; an OPFS one stands in for a folder dropped from the disk.
    const source = await files.create_directory(home, "outside");
    await files.write_file(await files.create_file(source, "inner.txt"), "inner");

    const imported = await files.import_entries("/home/in", [new File(["new"], "a.txt"), source]);
    expect(imported).toEqual(["/home/in/a (1).txt", "/home/in/outside"]);
    expect(await (await files.get_file("/home/in/a (1).txt"))!.text()).toBe("new");
    expect(await (await files.get_file("/home/in/outside/inner.txt"))!.text()).toBe("inner");
  });

  test("a missing target throws", async () => {
    await expect(files.import_entries("/home/nope", [new File(["x"], "x.txt")])).rejects.toThrow("doesn't exist");
  });
});
