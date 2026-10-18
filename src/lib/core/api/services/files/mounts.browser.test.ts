import { flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import * as opfs from "./opfs";
import { load_mounts, type StoredMount } from "./mounts-store";
import { FilesService } from "./service.svelte";
import { MountState } from "./type";
import { boot_test_kernel, stub_service } from "../../kernel/test-kernel";
import { NotificationsService } from "../notifications/service.svelte";
import { ShellService } from "../shell/service.svelte";
import { EntryStatus } from "../shell/type";
import { store_device_files } from "$lib/core/components/files/picker";

// Headless Chromium's renderer crashes when a file system handle goes into IndexedDB, so the store is kept in memory
// here; mounts-store.browser.test.ts covers IndexedDB itself.
const stored = vi.hoisted(() => new Map<string, StoredMount>());
vi.mock("./mounts-store", () => ({
  load_mounts: async () => [...stored.values()],
  save_mount: async (mount: StoredMount) => void stored.set(mount.name, mount),
  delete_mount: async (name: string) => void stored.delete(name),
}));

let files: FilesService;

/** An OPFS folder outside the hierarchy stands in for one picked with `showDirectoryPicker`: same handle type. */
async function disk_folder(name: string): Promise<FileSystemDirectoryHandle> {
  const folder = await (await opfs.get_root()).getDirectoryHandle(name, { create: true });
  await opfs.create_file(folder, "a.txt", { content: "on disk" });
  return folder;
}

beforeEach(async () => {
  stored.clear();
  await opfs.clear_opfs();
  files = new FilesService();
  await files.init();
});

afterEach(() => vi.restoreAllMocks());

describe("mount", () => {
  test("shows the folder at /mnt/<name> for path lookups and listings", async () => {
    const path = await files.mount(await disk_folder("Photos"));
    expect(path).toBe("/mnt/Photos");
    expect(await (await files.get_file("/mnt/Photos/a.txt"))?.text()).toBe("on disk");
    expect((await files.list(await files.get_directory("/mnt"))).map((item) => item.name)).toEqual(["Photos"]);
    expect(files.mounts[0].state).toBe(MountState.CONNECTED);
    expect(await files.get_file("/mnt/Nope/a.txt")).toBe(null);
  });

  test("a taken name gets a number, the same folder twice keeps its mount", async () => {
    const first = await disk_folder("Photos");
    await files.mount(first);
    expect(await files.mount(first)).toBe("/mnt/Photos");
    const other = await (await opfs.get_root()).getDirectoryHandle("elsewhere", { create: true });
    const second = await other.getDirectoryHandle("Photos", { create: true });
    expect(await files.mount(second)).toBe("/mnt/Photos (1)");
  });

  test("is remembered by the next boot", async () => {
    await files.mount(await disk_folder("Photos"));
    const next = new FilesService();
    await next.init();
    expect(next.mounts.map((mount) => mount.path)).toEqual(["/mnt/Photos"]);
  });

  test("writes inside a mount bump the mount path's revision", async () => {
    await files.mount(await disk_folder("Photos"));
    const directory = (await files.get_directory("/mnt/Photos"))!;
    await files.create_file(directory, "b.txt", { content: "x" });
    expect(files.revision("/mnt/Photos")).toBe(1);
  });

  test("a handler on /mnt lists the mount table", async () => {
    const handler = await files.directory(["mnt"]);
    flushSync();
    await vi.waitFor(() => expect(handler.loading).toBe(false));
    expect(handler.items).toEqual([]);
    await files.mount(await disk_folder("Photos"));
    flushSync();
    await vi.waitFor(() => expect(handler.items.map((item) => item.name)).toEqual(["Photos"]));
    handler.dispose();
  });

  test("unmount forgets the mount and leaves the folder alone", async () => {
    const folder = await disk_folder("Photos");
    await files.mount(folder);
    await files.unmount("/mnt/Photos");
    expect(files.mounts).toEqual([]);
    expect(await load_mounts()).toEqual([]);
    expect(await files.get_directory("/mnt/Photos")).toBe(null);
    expect(await opfs.exists(folder, "a.txt", "file")).toBe(true);
  });
});

describe("shell", () => {
  async function shell_session() {
    const booted = await boot_test_kernel({
      files: FilesService,
      notifications: NotificationsService,
      dialogs: stub_service("dialogs", { show: async () => true as never }),
      shell: ShellService,
    });
    const shell = booted.kernel.service<ShellService>("shell");
    // A history save is fire-and-forget and can outlive the test; the next clear_opfs then hits its open writable.
    vi.spyOn(shell, "remember").mockImplementation(() => {});
    const session = shell.session();
    const folder = await disk_folder("Photos");
    await booted.kernel.service<FilesService>("files").mount(folder);
    const run = async (line: string) => {
      const handle = session.run(line);
      await handle.done;
      return handle.entry;
    };
    return { run, folder, session, shutdown: booted.shutdown };
  }

  test("rm under /mnt needs -f", async () => {
    const { run, folder, shutdown } = await shell_session();
    expect((await run("rm /mnt/Photos/a.txt")).error).toMatch(/-f/);
    expect(await opfs.exists(folder, "a.txt")).toBe(true);
    expect((await run("rm -f /mnt/Photos/a.txt")).status).toBe(EntryStatus.DONE);
    expect(await opfs.exists(folder, "a.txt")).toBe(false);
    shutdown();
  });

  test("mounts lists them, umount forgets one and leaves it", async () => {
    const { run, session, shutdown } = await shell_session();
    expect((await run("mounts")).values).toEqual([{ $type: "mount", path: "/mnt/Photos", state: MountState.CONNECTED }]);
    await run("cd /mnt/Photos");
    expect((await run("umount /mnt/Photos")).status).toBe(EntryStatus.DONE);
    expect(session.cwd).toBe("/home");
    expect((await run("mounts")).values).toEqual([]);
    expect((await run("umount /mnt/Photos")).error).toMatch(/not available/);
    shutdown();
  });

  test("nothing is created in /mnt itself", async () => {
    const { run, shutdown } = await shell_session();
    expect((await run("mkdir /mnt/New")).error).toMatch(/mount/);
    expect((await run("mkdir /mnt/Photos/New")).status).toBe(EntryStatus.DONE);
    shutdown();
  });
});

describe("This device…", () => {
  test("copies picks into /tmp/device and returns their paths", async () => {
    const picked = [new File(["one"], "a.txt"), new File(["two"], "a.txt")];
    expect(await store_device_files(files, picked)).toEqual(["/tmp/device/a.txt", "/tmp/device/a (1).txt"]);
    expect(await (await files.get_file("/tmp/device/a (1).txt"))?.text()).toBe("two");
    expect(await store_device_files(files, [])).toEqual([]);
  });
});

describe("moves across the boundary", () => {
  test("OPFS to a mount copies, then deletes the source", async () => {
    const folder = await disk_folder("Photos");
    await files.mount(folder);
    const home = (await files.get_directory("/home"))!;
    await files.create_file(home, "b.txt", { content: "from home" });
    await files.create_directory(home, "Sub");

    expect(await files.move_paths(["/home/b.txt", "/home/Sub"], "/mnt/Photos")).toEqual(["/mnt/Photos/b.txt", "/mnt/Photos/Sub"]);
    expect(await (await folder.getFileHandle("b.txt")).getFile().then((file) => file.text())).toBe("from home");
    expect(await opfs.exists(folder, "Sub", "directory")).toBe(true);
    expect(await files.exists(home, "b.txt")).toBe(false);
    expect(await files.exists(home, "Sub")).toBe(false);
  });

  test("a mount to OPFS, the other way", async () => {
    const folder = await disk_folder("Photos");
    await files.mount(folder);
    expect(await files.move_paths(["/mnt/Photos/a.txt"], "/home")).toEqual(["/home/a.txt"]);
    expect(await opfs.exists(folder, "a.txt")).toBe(false);
    expect(await (await files.get_file("/home/a.txt"))?.text()).toBe("on disk");
  });
});
