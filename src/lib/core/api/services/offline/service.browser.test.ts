import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { boot_test_kernel, stub_service } from "../../kernel/test-kernel";
import * as opfs from "../files/opfs";
import { FilesService } from "../files/service.svelte";
import { NotificationsService } from "../notifications/service.svelte";
import { BUILD_INFO } from "../version/build-info";
import { serialize_seen, VERSION_STATE_PATH } from "../version/persistence";
import { OFFLINE_STATE_PATH, PICKED_PATH, parse_picked, parse_state, serialize_picked, serialize_state } from "./persistence";
import { OfflineService } from "./service.svelte";
import { OfflineStatus } from "./type";

const BUILD = BUILD_INFO.buildTimestamp;
const APPS: Record<string, { system: boolean; name: string; replaces?: { app: string }[] }> = {
  paint: { system: false, name: "Paint", replaces: [{ app: "old-art" }] },
  cards: { system: false, name: "Cards", replaces: [{ app: "old-art" }] },
  settings: { system: true, name: "Settings" },
};
const shutdowns: Array<() => Promise<void>> = [];

async function seed(path: string, text: string): Promise<void> {
  const files = new FilesService();
  await files.init();
  let handle = await files.get_root();
  const segments = path.split("/").filter(Boolean);
  for (const segment of segments.slice(0, -1)) handle = await handle.getDirectoryHandle(segment, { create: true });
  await opfs.write_file(await handle.getFileHandle(segments.at(-1)!, { create: true }), text);
}

async function open_tab() {
  const launch = vi.fn();
  const booted = await boot_test_kernel({
    files: FilesService,
    notifications: NotificationsService,
    apps: stub_service("apps", {
      launch,
      get: (id: string) => (APPS[id] ? { id, ...APPS[id] } : undefined) as never,
      list: () => Object.entries(APPS).map(([id, app]) => [id, { id, ...app }])[Symbol.iterator]() as never,
      is_installed: () => true,
    }),
    tasks: stub_service("tasks", {}),
    windows: stub_service("windows", { list: () => [], get: () => null }),
    offline: OfflineService,
  });
  shutdowns.push(booted.shutdown);
  return {
    files: booted.kernel.service<FilesService>("files"),
    offline: booted.kernel.service<OfflineService>("offline"),
    notifications: booted.kernel.service<NotificationsService>("notifications"),
    launch,
  };
}

async function read(files: FilesService, path: string): Promise<string | null> {
  return (await (await files.get_file(path))?.text()) ?? null;
}

beforeEach(async () => {
  await opfs.clear_opfs();
});

afterEach(async () => {
  for (const shutdown of shutdowns.splice(0).reverse()) await shutdown();
});

describe("boot", () => {
  test("a fresh install keeps nothing offline, says nothing and records this build", async () => {
    const tab = await open_tab();
    expect(tab.offline.picked.size).toBe(0);
    expect(tab.notifications.all).toEqual([]);
    await vi.waitFor(async () => expect(parse_state(await read(tab.files, OFFLINE_STATE_PATH))).toEqual({ build: BUILD, apps: [] }));
  });

  test("the first boot of this version on an existing install says apps now load on demand, once", async () => {
    await seed(VERSION_STATE_PATH, serialize_seen("3.57.0"));
    const tab = await open_tab();
    expect(tab.notifications.all.map((notification) => notification.title)).toEqual(["Apps now load when you open them"]);
    tab.notifications.all[0].actions?.[0].on_click();
    expect(tab.launch).toHaveBeenCalledWith("settings", { section: "offline" });

    await vi.waitFor(async () => expect(await read(tab.files, OFFLINE_STATE_PATH)).not.toBeNull());
    const again = await open_tab();
    expect(again.notifications.all).toEqual([]);
  });

  test("apps saved in this build stay saved; another build's are forgotten", async () => {
    await seed(OFFLINE_STATE_PATH, serialize_state({ build: BUILD, apps: ["paint"] }));
    const tab = await open_tab();
    expect(tab.offline.is_saved("paint")).toBe(true);
    expect(tab.offline.status("paint")).toBe(OfflineStatus.SAVED);
    expect(tab.offline.status("cards")).toBe(OfflineStatus.NOT_SAVED);

    await opfs.clear_opfs();
    await seed(OFFLINE_STATE_PATH, serialize_state({ build: BUILD - 1, apps: ["paint"] }));
    const updated = await open_tab();
    expect(updated.offline.is_saved("paint")).toBe(false);
    await vi.waitFor(async () => expect(parse_state(await read(updated.files, OFFLINE_STATE_PATH))).toEqual({ build: BUILD, apps: [] }));
  });

  test("system apps are always saved and never picked", async () => {
    await seed(PICKED_PATH, serialize_picked(["settings", "paint"]));
    const tab = await open_tab();
    expect([...tab.offline.picked]).toEqual(["paint"]);
    expect(tab.offline.status("settings")).toBe(OfflineStatus.SYSTEM);
    expect(tab.offline.is_saved("settings")).toBe(true);
    tab.offline.online = false;
    expect(tab.offline.can_open("settings")).toBe(true);
    expect(tab.offline.can_open("cards")).toBe(false);
  });

  test("a pick of a replaced app becomes the apps that replaced it (ADR-071)", async () => {
    await seed(PICKED_PATH, serialize_picked(["old-art", "gone"]));
    const tab = await open_tab();
    expect([...tab.offline.picked].sort()).toEqual(["cards", "paint"]);
  });
});

describe("picking", () => {
  test("set_picked writes /etc/offline.json, ignoring system apps", async () => {
    const tab = await open_tab();
    tab.offline.set_picked("cards", true);
    tab.offline.set_picked("settings", true);
    await vi.waitFor(async () => expect(parse_picked(await read(tab.files, PICKED_PATH))).toEqual(["cards"]));
    tab.offline.set_picked("cards", false);
    await vi.waitFor(async () => expect(parse_picked(await read(tab.files, PICKED_PATH))).toEqual([]));
  });

  test("an edit to the file through FilesService is followed", async () => {
    const tab = await open_tab();
    const etc = await tab.files.get_directory("/etc");
    await tab.files.create_file(etc!, "offline.json", { content: serialize_picked(["paint"]), overwrite: true });
    await vi.waitFor(() => expect(tab.offline.is_picked("paint")).toBe(true));
  });
});
