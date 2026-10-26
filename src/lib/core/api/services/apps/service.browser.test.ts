import { flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Kernel } from "$lib/core/api";
import { boot_test_kernel, stub_service } from "../../kernel/test-kernel";
import * as opfs from "../files/opfs";
import { FilesService } from "../files/service.svelte";
import { NotificationsService } from "../notifications/service.svelte";
import { parse_settings, SETTINGS_PATH } from "../settings/persistence";
import { SettingsService } from "../settings/service.svelte";
import { serialize_seen, VERSION_STATE_PATH } from "../version/persistence";
import { WindowsService } from "../windows/service.svelte";
import { BUILD_INFO } from "../version/build-info";
import { serialize_slice } from "./catalogue";
import { CATALOGUE_PATH, INSTALLED_PATH, parse_installed, serialize_installed } from "./installed";
import { parse_recent, RECENT_PATH, serialize_recent } from "./recent";
import { add_time, parse_usage, serialize_usage, USAGE_PATH } from "./active-time";
import { AppsService as AppsServiceClass } from "./service.svelte";
import { glob_source, type CatalogueSource } from "./source";
import { TEST_APPS, TestAppsService } from "./test-apps";
import type { AppsService } from "./type";
import { serialize_widget } from "./widget";
import { serialize_shortcut } from "./shortcut";
import { CORE_APPS } from "./helpers";

let shutdown: () => Promise<void>;

async function write(path: string, text: string) {
  const files = new FilesService();
  await files.init();
  const [directory, name] = [path.slice(0, path.lastIndexOf("/")), path.slice(path.lastIndexOf("/") + 1)];
  let handle = await files.get_root();
  for (const segment of directory.split("/").filter(Boolean)) handle = await handle.getDirectoryHandle(segment, { create: true });
  await opfs.write_file(await handle.getFileHandle(name, { create: true }), text);
}

async function boot(): Promise<Kernel> {
  const booted = await boot_test_kernel({
    files: FilesService,
    settings: SettingsService,
    windows: WindowsService,
    notifications: NotificationsService,
    dialogs: stub_service("dialogs", {}),
    apps: TestAppsService,
  });
  shutdown = booted.shutdown;
  return booted.kernel;
}

const apps = (kernel: Kernel) => kernel.service<AppsService>("apps");
const toasts = (kernel: Kernel) => kernel.service<NotificationsService>("notifications").all.map((notification) => notification.title);
const user_apps = (kernel: Kernel) => [...apps(kernel).list()].filter(([, manifest]) => !manifest.system).map(([id]) => id);

async function on_disk(kernel: Kernel): Promise<string[] | null> {
  const file = await kernel.service<FilesService>("files").get_file(INSTALLED_PATH);
  return parse_installed(file ? await file.text() : null)?.ids ?? null;
}

beforeEach(async () => {
  await vi.waitFor(() => opfs.clear_opfs());
  for (const key of Object.keys(localStorage)) if (key.startsWith("app.")) localStorage.removeItem(key);
});
afterEach(async () => await shutdown?.());

describe("AppsService installed apps", () => {
  test("a first boot starts with the core apps only, quietly (ADR-077)", async () => {
    const kernel = await boot();
    expect(user_apps(kernel).some((id) => apps(kernel).is_installed(id))).toBe(false);
    for (const id of CORE_APPS) expect(apps(kernel).is_installed(id)).toBe(true);
    expect(apps(kernel).is_installed("docs")).toBe(false);
    expect(apps(kernel).is_installed("text-editor")).toBe(false);
    await vi.waitFor(async () => expect(await on_disk(kernel)).toEqual([]));
    expect(toasts(kernel)).toEqual([]);
  });

  test("a device from before keeps what it used, once, with Undo", async () => {
    await write(VERSION_STATE_PATH, serialize_seen("1.0.0"));
    await write("/home/Desktop/Board.widget", serialize_widget({ app: "board", w: 2, h: 2 }));
    localStorage.setItem("app.game.best", "12");
    const kernel = await boot();

    expect(apps(kernel).is_installed("board")).toBe(true);
    expect(apps(kernel).is_installed("game")).toBe(true);
    expect(apps(kernel).is_installed("notes")).toBe(false);
    expect(apps(kernel).is_installed("settings")).toBe(true);
    await vi.waitFor(async () => expect(await on_disk(kernel)).toEqual(["board", "game"]));

    const toast = kernel.service<NotificationsService>("notifications").all[0];
    expect(toast.title).toMatch(/^Tidied \d+ apps you never opened$/);
    toast.actions!.find((action) => action.label === "Undo")!.on_click();
    expect(user_apps(kernel).every((id) => apps(kernel).is_installed(id))).toBe(true);
  });

  test("a list from before core apps keeps the system apps past use points to, once (ADR-077)", async () => {
    await write(INSTALLED_PATH, JSON.stringify({ version: 1, installed: ["notes"] }));
    localStorage.setItem("app.calculator.memory", "4");
    await write("/home/Desktop/Kernel.desktop", serialize_shortcut({ app_id: "kernel" }));
    const kernel = await boot();
    expect(apps(kernel).is_installed("calculator")).toBe(true);
    expect(apps(kernel).is_installed("kernel")).toBe(true);
    expect(apps(kernel).is_installed("docs")).toBe(false);
    expect(apps(kernel).is_installed("notes")).toBe(true);
    await vi.waitFor(async () => {
      const file = await kernel.service<FilesService>("files").get_file(INSTALLED_PATH);
      expect(parse_installed(await file!.text())).toEqual({ ids: ["calculator", "kernel", "notes"], system: true });
    });
  });

  test("system apps other than the core ones uninstall; the slice still names them", async () => {
    await write(INSTALLED_PATH, serialize_installed(["docs"]));
    const kernel = await boot();
    expect(apps(kernel).is_installed("docs")).toBe(true);
    await apps(kernel).uninstall("docs");
    expect(apps(kernel).is_installed("docs")).toBe(false);
    expect(apps(kernel).installed_catalogue()?.apps.map(({ id }) => id)).toContain("docs");
    await expect(apps(kernel).uninstall("file-explorer")).rejects.toThrow(/can't be uninstalled/);
  });

  test("a saved list loads as is and drops unknown ids", async () => {
    await write(INSTALLED_PATH, serialize_installed(["notes", "gone"]));
    const kernel = await boot();
    expect([...apps(kernel).list({ installed: true })].filter(([, manifest]) => !manifest.system).map(([id]) => id)).toEqual(["notes"]);
    expect([...apps(kernel).list({ installed: false })].map(([id]) => id)).toContain("board");
  });

  test("a replaced id in the saved list becomes every app that replaced it (ADR-071)", async () => {
    await write(INSTALLED_PATH, serialize_installed(["notes", "old-games"]));
    const kernel = await boot();
    expect(user_apps(kernel).filter((id) => apps(kernel).is_installed(id)).sort()).toEqual(["example", "game", "notes"]);
  });

  test("launching a replaced id opens the app its props name, without them; no match takes the bare entry", async () => {
    await write(INSTALLED_PATH, serialize_installed(["example", "game"]));
    const kernel = await boot();
    const windows = kernel.service<WindowsService>("windows");
    const opened = (id: string) => windows.get(id)?.app;
    expect(opened(apps(kernel).launch("old-games", { mode: "count", count: 2 }))).toMatchObject({ id: "example", props: { count: 2 } });
    expect(opened(apps(kernel).launch("old-games"))).toMatchObject({ id: "game", props: undefined });
    expect(() => apps(kernel).launch("gone")).toThrow("App gone not found");
  });

  test("pins and file defaults naming a replaced id point at the app a bare launch opens, and settings saves them (ADR-071)", async () => {
    await write(SETTINGS_PATH, JSON.stringify({ version: 1, taskbar: { pinned: ["notes", "old-games", "game"] }, file_defaults: { ".md": "notes", ".lvl": "old-games" } }));
    const kernel = await boot();
    const settings = kernel.service<SettingsService>("settings");
    expect(settings.taskbar.pinned).toEqual(["notes", "game"]);
    expect(settings.file_defaults).toEqual({ ".md": "notes", ".lvl": "game" });
    flushSync();
    await vi.waitFor(async () => {
      const file = await kernel.service<FilesService>("files").get_file(SETTINGS_PATH);
      expect(parse_settings(await file!.text())?.taskbar.pinned).toEqual(["notes", "game"]);
    });
  });

  test("launching an app that isn't installed opens it without installing, and the toast's Install installs it", async () => {
    await write(INSTALLED_PATH, serialize_installed([]));
    const kernel = await boot();
    apps(kernel).launch("example");
    expect(apps(kernel).is_installed("example")).toBe(false);
    expect(toasts(kernel)).toEqual(["Example isn't installed"]);
    const notifications = kernel.service<NotificationsService>("notifications");
    notifications.all[0].actions?.find((action) => action.label === "Install")?.on_click();
    expect(apps(kernel).is_installed("example")).toBe(true);
    await vi.waitFor(async () => expect(await on_disk(kernel)).toEqual(["example"]));
    apps(kernel).launch("example");
    expect(toasts(kernel)).toEqual(["Example isn't installed"]);
  });

  test("uninstall keeps data unless asked; system apps refuse", async () => {
    await write(INSTALLED_PATH, serialize_installed(["board", "notes"]));
    await write("/var/lib/apps/notes/notes.json", "{}");
    localStorage.setItem("app.notes.view", "list");
    localStorage.setItem("app.board.zone", "UTC");
    const kernel = await boot();
    const files = kernel.service<FilesService>("files");

    await apps(kernel).uninstall("board");
    expect(apps(kernel).is_installed("board")).toBe(false);
    expect(localStorage.getItem("app.board.zone")).toBe("UTC");

    await apps(kernel).uninstall("notes", { data: true });
    expect(localStorage.getItem("app.notes.view")).toBeNull();
    expect(await files.get_directory("/var/lib/apps/notes")).toBeNull();
    await vi.waitFor(async () => expect(await on_disk(kernel)).toEqual([]));

    await expect(apps(kernel).uninstall("settings")).rejects.toThrow(/can't be uninstalled/);
  });

  test("uninstall with data runs the app's own cleanup; a failing one leaves a toast", async () => {
    await write(INSTALLED_PATH, serialize_installed(["board", "notes"]));
    const kernel = await boot();
    const cleanup = vi.fn(async () => {});
    apps(kernel).register({ ...apps(kernel).get("notes")!, on_uninstall_data: async () => ({ default: cleanup }) });
    apps(kernel).register({ ...apps(kernel).get("board")!, on_uninstall_data: async () => ({ default: async () => Promise.reject(new Error("locked")) }) });

    await apps(kernel).uninstall("notes");
    expect(cleanup).not.toHaveBeenCalled();
    apps(kernel).install("notes");
    await apps(kernel).uninstall("notes", { data: true });
    expect(cleanup).toHaveBeenCalledOnce();

    await apps(kernel).uninstall("board", { data: true });
    expect(apps(kernel).is_installed("board")).toBe(false);
    expect(toasts(kernel)).toContain("Some of Board's data is left");
  });

  test("an app's shell commands need it installed", async () => {
    await write(INSTALLED_PATH, serialize_installed([]));
    const kernel = await boot();
    const contribution = apps(kernel).shell!();
    const commands = contribution.commands ?? [];
    const command = ((await contribution.lazy!()).commands ?? []).find((candidate) => candidate.app === "notes")!;
    expect(command.available?.()).toBe("Notes isn't installed. Install it in the App Store");
    apps(kernel).install("notes");
    expect(command.available?.() ?? true).toBe(true);
    expect(() => commands.find((candidate) => candidate.id === "app launch")!.run({ args: { id: "board" } } as never)).toThrow(/isn't installed/);
  });
});

describe("AppsService usage stats", () => {
  afterEach(() => delete (globalThis as { gtag?: unknown }).gtag);

  test("a launch sends app_open with the app, mode and platform, never its props", async () => {
    const kernel = await boot();
    const gtag = vi.fn();
    (globalThis as { gtag?: unknown }).gtag = gtag;
    apps(kernel).launch("settings", { section: "about" });
    expect(gtag).toHaveBeenCalledExactlyOnceWith("event", "app_open", { app_id: "settings", mode: "desktop", platform: kernel.platform });
  });
});

describe("AppsService recent apps", () => {
  async function recent_on_disk(kernel: Kernel): Promise<string[]> {
    const file = await kernel.service<FilesService>("files").get_file(RECENT_PATH);
    return parse_recent(file ? await file.text() : null);
  }

  test("launch records user apps newest first, once each; system apps never", async () => {
    await write(INSTALLED_PATH, serialize_installed(["board", "notes"]));
    const kernel = await boot();
    apps(kernel).launch("board");
    apps(kernel).launch("settings");
    apps(kernel).launch("notes");
    apps(kernel).launch("board");
    expect(apps(kernel).recent).toEqual(["board", "notes"]);
    await vi.waitFor(async () => expect(await recent_on_disk(kernel)).toEqual(["board", "notes"]));
  });

  test("the saved list loads, dropping system, unknown and uninstalled apps", async () => {
    await write(INSTALLED_PATH, serialize_installed(["board", "notes"]));
    await write(RECENT_PATH, serialize_recent(["gone", "notes", "settings", "game", "board"]));
    const kernel = await boot();
    expect(apps(kernel).recent).toEqual(["notes", "board"]);

    await apps(kernel).uninstall("notes");
    expect(apps(kernel).recent).toEqual(["board"]);
    apps(kernel).install("notes");
    expect(apps(kernel).recent).toEqual(["notes", "board"]);
  });

  test("a replaced id in the saved list shows as the app a bare launch opens (ADR-071)", async () => {
    await write(INSTALLED_PATH, serialize_installed(["example", "game", "notes"]));
    await write(RECENT_PATH, serialize_recent(["old-games", "notes", "game"]));
    const kernel = await boot();
    expect(apps(kernel).recent).toEqual(["game", "notes"]);
  });

  test("clear_recent empties and saves the list", async () => {
    await write(INSTALLED_PATH, serialize_installed(["board"]));
    await write(RECENT_PATH, serialize_recent(["board"]));
    const kernel = await boot();
    apps(kernel).clear_recent();
    expect(apps(kernel).recent).toEqual([]);
    await vi.waitFor(async () => expect(await recent_on_disk(kernel)).toEqual([]));
  });

  test("app recent yields the list; --clear forgets it", async () => {
    await write(INSTALLED_PATH, serialize_installed(["board", "notes"]));
    await write(RECENT_PATH, serialize_recent(["notes", "board"]));
    const kernel = await boot();
    const command = (apps(kernel).shell!().commands ?? []).find((candidate) => candidate.id === "app recent")!;
    const yielded: unknown[] = [];
    for await (const value of command.run({ args: { clear: false } } as never) as AsyncIterable<unknown>) yielded.push(value);
    expect(yielded).toMatchObject([{ $type: "app", id: "notes" }, { $type: "app", id: "board" }]);

    for await (const _ of command.run({ args: { clear: true } } as never) as AsyncIterable<unknown>);
    expect(apps(kernel).recent).toEqual([]);
  });
});

describe("app find", () => {
  async function find(kernel: Kernel, words: string[]): Promise<unknown[]> {
    const command = (apps(kernel).shell!().commands ?? []).find((candidate) => candidate.id === "app find")!;
    const yielded: unknown[] = [];
    for await (const value of command.run({ args: { words } } as never) as AsyncIterable<unknown>) yielded.push(value);
    return yielded;
  }

  test("strict matches first, then the sentence search's, installed or not; offered to Ask", async () => {
    await write(INSTALLED_PATH, serialize_installed([]));
    const kernel = await boot();
    const command = (apps(kernel).shell!().commands ?? []).find((candidate) => candidate.id === "app find")!;
    expect(command.ai).toBe("read");
    expect(await find(kernel, ["test", "app"])).toMatchObject([{ $type: "app", id: "example", description: "Test app" }]);
    expect((await find(kernel, ["something", "for", "my", "notes"]))[0]).toMatchObject({ $type: "app", id: "notes" });
    await expect(find(kernel, [])).rejects.toThrow(/say what the app should do/);
  });

  test("clicking an app that isn't installed opens it in the App Store", async () => {
    await write(INSTALLED_PATH, serialize_installed([]));
    const kernel = await boot();
    const launch = vi.spyOn(apps(kernel), "launch").mockReturnValue("w");
    const open = apps(kernel).shell!().values!.app.open!;
    open({ $type: "app", id: "notes" });
    expect(launch).toHaveBeenLastCalledWith("app-library", { app: "notes" });
    open({ $type: "app", id: "settings" });
    expect(launch).toHaveBeenLastCalledWith("settings");
  });
});

describe("AppsService catalogue text (ADR-077)", () => {
  test("listings carry each app's text from boot, and filter like list()", async () => {
    const service = apps(await boot());
    const listing = (id: string) => service.listings().find((candidate) => candidate.id === id);
    expect(listing("example")).toMatchObject({ id: "example", name: "Example", description: "Test app" });
    expect(listing("settings")?.description).toBeTruthy();
    expect(service.listings().map(({ id }) => id)).toEqual([...service.list()].map(([id]) => id));
    expect(service.listings({ installed: true }).every(({ id }) => service.is_installed(id))).toBe(true);
    expect(service.listings({ installed: false }).some(({ id }) => service.is_installed(id))).toBe(false);
  });

  test("meta resolves the entry's text; an app without any, or an unknown id, resolves {}", async () => {
    const service = apps(await boot());
    service.register({ ...service.get("board")!, id: "no-meta" });
    expect(await service.meta("example")).toEqual({ description: "Test app" });
    expect((await service.meta("settings")).description).toBeTruthy();
    expect(await service.meta("no-meta")).toEqual({});
    expect(await service.meta("nope")).toEqual({});
  });
});

describe("AppsService catalogue (ADR-077)", () => {
  interface Gate {
    fetches: number;
    online: boolean;
    open: () => void;
  }

  async function sourced(build_of_fetch = BUILD_INFO.buildTimestamp): Promise<{ service: typeof AppsServiceClass; gate: Gate }> {
    const { apps: glob } = await import("$lib/apps");
    const base = glob_source([...glob.filter((manifest) => manifest.system), ...TEST_APPS]);
    let open = () => {};
    const ready = new Promise<void>((resolve) => (open = resolve));
    const gate: Gate = { fetches: 0, online: true, open: () => open() };
    const source: CatalogueSource = {
      build: BUILD_INFO.buildTimestamp,
      async fetch() {
        gate.fetches += 1;
        if (!gate.online) return null;
        const catalogue = await base.fetch();
        return catalogue && { ...catalogue, build: build_of_fetch };
      },
      async manifest(entry) {
        await ready;
        return base.manifest(entry);
      },
    };
    class SourcedApps extends AppsServiceClass {
      protected override catalogue_source(): Promise<CatalogueSource> {
        return Promise.resolve(source);
      }
    }
    return { service: SourcedApps, gate };
  }

  async function boot_with(service: typeof AppsServiceClass): Promise<Kernel> {
    const booted = await boot_test_kernel({
      files: FilesService,
      settings: SettingsService,
      windows: WindowsService,
      notifications: NotificationsService,
      dialogs: stub_service("dialogs", {}),
      apps: service,
    });
    shutdown = booted.shutdown;
    return booted.kernel;
  }

  async function write_slice(build: number, ids: string[]) {
    const { apps: glob } = await import("$lib/apps");
    const full = (await glob_source([...glob.filter((manifest) => manifest.system), ...TEST_APPS]).fetch())!;
    await write(CATALOGUE_PATH, serialize_slice({ ...full, build }, full.apps.filter((entry) => ids.includes(entry.id))));
  }

  const system_ids = async () => (await import("$lib/apps")).apps.filter((manifest) => manifest.system).map((manifest) => manifest.id);

  test("boot reads the installed apps' slice and fetches nothing; catalogue() brings the rest", async () => {
    const { service, gate } = await sourced();
    await write(VERSION_STATE_PATH, serialize_seen("1.0.0"));
    await write(INSTALLED_PATH, serialize_installed(["example"]));
    await write_slice(BUILD_INFO.buildTimestamp, [...(await system_ids()), "example"]);
    const kernel = await boot_with(service);
    expect(gate.fetches).toBe(0);
    expect(user_apps(kernel)).toEqual(["example"]);
    expect(await apps(kernel).catalogue()).toBe(true);
    expect(gate.fetches).toBe(1);
    expect(user_apps(kernel).sort()).toEqual(["board", "example", "game", "notes"]);
    expect(await apps(kernel).catalogue()).toBe(true);
    expect(gate.fetches).toBe(1);
  });

  test("another build's slice fetches the full catalogue at boot, and keeps every installed id", async () => {
    const { service, gate } = await sourced();
    await write(VERSION_STATE_PATH, serialize_seen("1.0.0"));
    await write(INSTALLED_PATH, serialize_installed(["example", "notes"]));
    await write_slice(1, [...(await system_ids()), "example"]);
    const kernel = await boot_with(service);
    expect(gate.fetches).toBe(1);
    expect(apps(kernel).is_installed("notes")).toBe(true);
    expect(apps(kernel).installed_catalogue()?.apps.map(({ id }) => id)).toContain("notes");
  });

  test("offline with another build's slice, its apps are listed but don't open", async () => {
    const { service, gate } = await sourced();
    gate.online = false;
    await write(VERSION_STATE_PATH, serialize_seen("1.0.0"));
    await write(INSTALLED_PATH, serialize_installed(["example"]));
    await write_slice(1, [...(await system_ids()), "example"]);
    const kernel = await boot_with(service);
    gate.open();
    expect(apps(kernel).is_installed("example")).toBe(true);
    await expect(apps(kernel).load("example")).rejects.toThrow(/updated since this page loaded/);
    expect(apps(kernel).installed_catalogue()).toBeNull();
  });

  test("before its code lands an app is a stub: a launch opens at once and checks the props once it lands", async () => {
    const { service, gate } = await sourced();
    const kernel = await boot_with(service);
    const stub = apps(kernel).get("example")!;
    expect(stub.props).toBeUndefined();
    expect(stub.version).toBe(BUILD_INFO.version);
    const windows = kernel.service<WindowsService>("windows");
    const good = apps(kernel).launch("example", { count: 3 });
    const bad = apps(kernel).launch("example", { count: "three" });
    expect(windows.get(good)?.app.manifest.name).toBe("Example");
    gate.open();
    await vi.waitFor(() => expect(apps(kernel).get("example")?.props).toBeDefined());
    await vi.waitFor(() => expect(toasts(kernel)).toContain("Example opened without its data"));
    expect(windows.get(good)?.app.props).toEqual({ count: 3 });
    expect(windows.get(bad)?.app.props).toBeUndefined();
  });

  test("installed_catalogue follows installs and uninstalls", async () => {
    const { service, gate } = await sourced();
    gate.open();
    const kernel = await boot_with(service);
    const ids = () => apps(kernel).installed_catalogue()?.apps.map(({ id }) => id) ?? [];
    expect(ids()).not.toContain("example");
    apps(kernel).install("example");
    expect(ids()).toContain("example");
    await apps(kernel).uninstall("example");
    expect(ids()).not.toContain("example");
    expect(ids()).toEqual(expect.arrayContaining(await system_ids()));
  });
});

describe("AppsService active time", () => {
  async function usage_on_disk(kernel: Kernel) {
    const file = await kernel.service<FilesService>("files").get_file(USAGE_PATH);
    return parse_usage(file ? await file.text() : null);
  }

  test("the saved time loads", async () => {
    await write(USAGE_PATH, serialize_usage(add_time({}, "board", 7200, new Date(2026, 9, 1))));
    const kernel = await boot();
    await vi.waitFor(() => expect(apps(kernel).usage("board")?.seconds).toBe(7200));
    expect(apps(kernel).usage("notes")).toBeNull();
  });

  test("a focused window's time is counted and saved when focus leaves it", async () => {
    await write(INSTALLED_PATH, serialize_installed(["board", "notes"]));
    const kernel = await boot();
    const windows = kernel.service<WindowsService>("windows");
    const board = apps(kernel).launch("board");
    await vi.waitFor(() => expect(windows.get_focused()).toBe(board));
    await new Promise((resolve) => setTimeout(resolve, 1200));
    apps(kernel).launch("notes");
    flushSync();

    expect(apps(kernel).usage("board")?.seconds).toBeGreaterThanOrEqual(1);
    expect(apps(kernel).usage("board")?.days).toBe(1);
    await vi.waitFor(async () => expect((await usage_on_disk(kernel)).board?.seconds).toBeGreaterThanOrEqual(1), { timeout: 4000 });
  });
});
