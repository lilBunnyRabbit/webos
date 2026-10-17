import { afterEach, expect, test } from "vitest";
import { delete_mount, load_mounts, save_mount } from "./mounts-store";

// A plain object stands in for the handle: headless Chromium's renderer crashes cloning a real one into IndexedDB.
const handle = { kind: "directory", name: "Photos" } as unknown as FileSystemDirectoryHandle;

afterEach(async () => {
  for (const { name } of await load_mounts()) await delete_mount(name);
});

test("keeps mounts across loads and forgets them on delete", async () => {
  await save_mount({ name: "Photos", handle });
  await save_mount({ name: "Notes", handle });
  expect((await load_mounts()).map((mount) => mount.name)).toEqual(["Notes", "Photos"]);
  expect((await load_mounts())[1].handle).toEqual(handle);

  await delete_mount("Photos");
  expect((await load_mounts()).map((mount) => mount.name)).toEqual(["Notes"]);
});

test("saving a name again replaces it", async () => {
  await save_mount({ name: "Photos", handle });
  await save_mount({ name: "Photos", handle: { ...handle, name: "Other" } as unknown as FileSystemDirectoryHandle });
  expect(await load_mounts()).toHaveLength(1);
});
