import { beforeEach, describe, expect, test } from "vitest";
import * as opfs from "./opfs";

let root: FileSystemDirectoryHandle;

const names = async (dir: FileSystemDirectoryHandle) => (await opfs.list_directory(dir, { include_metadata: false })).map((item) => item.name).sort();
const text = async (dir: FileSystemDirectoryHandle, name: string) => (await (await dir.getFileHandle(name)).getFile()).text();

beforeEach(async () => {
  await opfs.clear_opfs();
  root = await opfs.get_root();
});

describe("available_name", () => {
  test("numbers before the extension, dotfiles keep their dot", async () => {
    for (const name of ["a.txt", "a.tar.gz", ".env", "plain"]) await root.getFileHandle(name, { create: true });
    expect(await opfs.available_name(root, "free.txt")).toBe("free.txt");
    expect(await opfs.available_name(root, "a.txt")).toBe("a (1).txt");
    expect(await opfs.available_name(root, "a.tar.gz")).toBe("a.tar (1).gz");
    expect(await opfs.available_name(root, ".env")).toBe(".env (1)");
    expect(await opfs.available_name(root, "plain")).toBe("plain (1)");
  });

  test("skips numbers already taken", async () => {
    for (const name of ["a.txt", "a (1).txt"]) await root.getFileHandle(name, { create: true });
    expect(await opfs.available_name(root, "a.txt")).toBe("a (2).txt");
  });
});

describe("create_file", () => {
  test("auto-renames on clash, overwrite replaces", async () => {
    await opfs.create_file(root, "a.txt", { content: "one" });
    const second = await opfs.create_file(root, "a.txt", { content: "two" });
    expect(second.name).toBe("a (1).txt");

    await opfs.create_file(root, "a.txt", { content: "three", overwrite: true });
    expect(await text(root, "a.txt")).toBe("three");
  });
});

describe("copy and move", () => {
  test("copy_directory copies the tree and auto-renames on clash", async () => {
    const source = await root.getDirectoryHandle("src", { create: true });
    await opfs.create_file(source, "a.txt", { content: "a" });
    const nested = await source.getDirectoryHandle("nested", { create: true });
    await opfs.create_file(nested, "b.txt", { content: "b" });

    const copy = await opfs.copy_directory(source, root);
    expect(copy.name).toBe("src (1)");
    expect(await names(copy)).toEqual(["a.txt", "nested"]);
    expect(await text(await copy.getDirectoryHandle("nested"), "b.txt")).toBe("b");
    expect(await names(source)).toEqual(["a.txt", "nested"]);
  });

  test("move_file onto itself is a no-op and keeps the content", async () => {
    const file = await opfs.create_file(root, "a.txt", { content: "keep" });
    await opfs.move_file(root, file, root);
    expect(await names(root)).toEqual(["a.txt"]);
    expect(await text(root, "a.txt")).toBe("keep");
  });

  test("move_file auto-renames in the target and keeps the handle valid", async () => {
    const target = await root.getDirectoryHandle("target", { create: true });
    await opfs.create_file(target, "a.txt", { content: "old" });
    const file = await opfs.create_file(root, "a.txt", { content: "new" });

    const moved = await opfs.move_file(root, file, target);
    expect(moved.name).toBe("a (1).txt");
    expect(await (await moved.getFile()).text()).toBe("new");
    expect(await names(root)).toEqual(["target"]);
  });

  test("move_directory recreates the tree and removes the source", async () => {
    const source = await root.getDirectoryHandle("src", { create: true });
    await opfs.create_file(await source.getDirectoryHandle("nested", { create: true }), "b.txt", { content: "b" });
    const target = await root.getDirectoryHandle("target", { create: true });

    const moved = await opfs.move_directory(root, source, target);
    expect(await names(root)).toEqual(["target"]);
    expect(await text(await moved.getDirectoryHandle("nested"), "b.txt")).toBe("b");
  });
});

describe("rename_entry", () => {
  test("never auto-renames: a taken name throws", async () => {
    await opfs.create_file(root, "a.txt");
    await opfs.create_file(root, "b.txt");
    await expect(opfs.rename_entry(root, "a.txt", "b.txt")).rejects.toThrow(/already exists/);
  });

  test("renames a folder with its contents", async () => {
    const folder = await root.getDirectoryHandle("old", { create: true });
    await opfs.create_file(folder, "a.txt", { content: "a" });
    await opfs.rename_entry(root, "old", "new");
    expect(await names(root)).toEqual(["new"]);
    expect(await text(await root.getDirectoryHandle("new"), "a.txt")).toBe("a");
  });
});
