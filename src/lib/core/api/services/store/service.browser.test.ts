import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { boot_test_kernel, stub_service } from "../../kernel/test-kernel";
import * as opfs from "../files/opfs";
import { FilesService } from "../files/service.svelte";
import { NotificationsService } from "../notifications/service.svelte";
import { BUILD_INFO } from "../version/build-info";
import { LEGACY_PICKED_PATH, LEGACY_STATE_PATH, STORE_STATE_PATH, parse_state, serialize_picked, serialize_state } from "./persistence";
import { StoreService } from "./service.svelte";
import { StoreStatus } from "./type";
import { CATALOGUE_PATH } from "../apps/installed";
import { parse_catalogue_text } from "../apps/catalogue";

const BUILD = BUILD_INFO.buildTimestamp;
const APPS: Record<string, { system: boolean; name: string; replaces?: { app: string }[] }> = {
  paint: { system: false, name: "Paint", replaces: [{ app: "old-art" }] },
  cards: { system: false, name: "Cards", replaces: [{ app: "old-art" }] },
  settings: { system: true, name: "Settings" },
};
const shutdowns: Array<() => Promise<void>> = [];
const entry_of = (id: string) => ({ id, name: APPS[id]?.name ?? id, category: "productivity", system: APPS[id]?.system ?? false, version: "1.0.0", hash: "", manifest: `${id}.js`, entry: "", files: [] });

async function seed(path: string, text: string): Promise<void> {
  const files = new FilesService();
  await files.init();
  let handle = await files.get_root();
  const segments = path.split("/").filter(Boolean);
  for (const segment of segments.slice(0, -1)) handle = await handle.getDirectoryHandle(segment, { create: true });
  await opfs.write_file(await handle.getFileHandle(segments.at(-1)!, { create: true }), text);
}

async function open_tab(installed: string[] = ["paint"]) {
  const set = new Set([...installed, ...Object.keys(APPS).filter((id) => APPS[id].system)]);
  const install = vi.fn((ids: string | string[]) => {
    for (const id of [ids].flat()) set.add(id);
    return [ids].flat();
  });
  const entries = () => Object.entries(APPS).map(([id, app]) => [id, { id, ...app }] as const);
  const booted = await boot_test_kernel({
    files: FilesService,
    notifications: NotificationsService,
    apps: stub_service("apps", {
      install,
      get: (id: string) => (APPS[id] ? { id, ...APPS[id] } : undefined) as never,
      list: ((filter: { installed?: boolean } = {}) =>
        entries()
          .filter(([id]) => filter.installed === undefined || set.has(id) === filter.installed)
          [Symbol.iterator]()) as never,
      is_installed: (id: string) => set.has(id),
      catalogue: async () => true,
      installed_catalogue: () => ({ version: 1, core: "c", build: BUILD, release: "1.0.0", apps: [...set].sort().map(entry_of) }),
    }),
    tasks: stub_service("tasks", {}),
    store: StoreService,
  });
  shutdowns.push(booted.shutdown);
  return {
    files: booted.kernel.service<FilesService>("files"),
    store: booted.kernel.service<StoreService>("store"),
    notifications: booted.kernel.service<NotificationsService>("notifications"),
    install,
  };
}

async function read(files: FilesService, path: string): Promise<string | null> {
  return (await (await files.get_file(path))?.text()) ?? null;
}

beforeEach(async () => {
  await vi.waitFor(() => opfs.clear_opfs());
});

afterEach(async () => {
  for (const shutdown of shutdowns.splice(0).reverse()) await shutdown();
});

describe("boot", () => {
  test("a fresh install has nothing saved, says nothing and records this build", async () => {
    const tab = await open_tab();
    expect(tab.store.is_saved("paint")).toBe(false);
    expect(tab.notifications.all).toEqual([]);
    await vi.waitFor(async () => expect(parse_state(await read(tab.files, STORE_STATE_PATH))).toEqual({ build: BUILD, apps: [] }));
  });

  test("apps saved in this build stay saved; another build's are forgotten", async () => {
    await seed(STORE_STATE_PATH, serialize_state({ build: BUILD, apps: ["paint"] }));
    const tab = await open_tab();
    expect(tab.store.is_saved("paint")).toBe(true);
    expect(tab.store.status("paint")).toBe(StoreStatus.SAVED);
    expect(tab.store.status("settings")).toBe(StoreStatus.NOT_SAVED);
    expect(tab.store.status("cards")).toBe(StoreStatus.NOT_INSTALLED);
    expect(tab.store.progress("paint")).toBeNull();

    await vi.waitFor(() => opfs.clear_opfs());
    await seed(STORE_STATE_PATH, serialize_state({ build: BUILD - 1, apps: ["paint"] }));
    const updated = await open_tab();
    expect(updated.store.is_saved("paint")).toBe(false);
    await vi.waitFor(async () => expect(parse_state(await read(updated.files, STORE_STATE_PATH))).toEqual({ build: BUILD, apps: [] }));
  });
});

describe("migration (ADR-077)", () => {
  test("apps kept offline join the installed apps, and the old file goes", async () => {
    await seed(LEGACY_PICKED_PATH, serialize_picked(["cards"]));
    const tab = await open_tab();
    expect(tab.install).toHaveBeenCalledWith(["cards"]);
    expect(tab.store.status("cards")).toBe(StoreStatus.NOT_SAVED);
    expect(await read(tab.files, LEGACY_PICKED_PATH)).toBeNull();

    const again = await open_tab();
    expect(again.install).not.toHaveBeenCalled();
  });

  test("a kept app that was replaced installs the apps that replaced it (ADR-071)", async () => {
    await seed(LEGACY_PICKED_PATH, serialize_picked(["old-art", "gone"]));
    const tab = await open_tab([]);
    expect([tab.install.mock.calls[0][0]].flat().sort()).toEqual(["cards", "paint"]);
  });

  test("the old state file moves to /var/lib/store", async () => {
    await seed(LEGACY_STATE_PATH, serialize_state({ build: BUILD, apps: ["paint"] }));
    const tab = await open_tab();
    expect(tab.store.is_saved("paint")).toBe(true);
    expect(await tab.files.get_directory("/var/lib/offline")).toBeNull();
    await vi.waitFor(async () => expect(parse_state(await read(tab.files, STORE_STATE_PATH))).toEqual({ build: BUILD, apps: ["paint"] }));
  });
});

describe("installed apps' catalogue (ADR-077)", () => {
  test("boot writes the installed apps' entries for the next boot to read", async () => {
    const tab = await open_tab(["paint"]);
    await vi.waitFor(async () => {
      const slice = parse_catalogue_text(await read(tab.files, CATALOGUE_PATH));
      expect(slice?.build).toBe(BUILD);
      expect(slice?.apps.map(({ id }) => id)).toEqual(["paint", "settings"]);
    });
  });
});
