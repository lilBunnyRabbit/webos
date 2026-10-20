import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Kernel } from "$lib/core/api";
import { boot_test_kernel, stub_service } from "../../kernel/test-kernel";
import * as opfs from "../files/opfs";
import { FilesService } from "../files/service.svelte";
import { NotificationsService } from "../notifications/service.svelte";
import { serialize_session } from "../session/persistence";
import { SettingsService } from "../settings/service.svelte";
import { serialize_seen, VERSION_STATE_PATH } from "../version/persistence";
import { WindowsService } from "../windows/service.svelte";
import { INSTALLED_PATH, parse_installed, serialize_installed } from "./installed";
import { parse_recent, RECENT_PATH, serialize_recent } from "./recent";
import { TestAppsService } from "./test-apps";
import type { AppsService } from "./type";

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
  return parse_installed(file ? await file.text() : null);
}

beforeEach(async () => {
  await vi.waitFor(() => opfs.clear_opfs());
  for (const key of Object.keys(localStorage)) if (key.startsWith("app.")) localStorage.removeItem(key);
});
afterEach(async () => await shutdown?.());

describe("AppsService installed apps", () => {
  test("a first boot starts with the system apps only, quietly", async () => {
    const kernel = await boot();
    expect(user_apps(kernel).some((id) => apps(kernel).is_installed(id))).toBe(false);
    expect(apps(kernel).is_installed("settings")).toBe(true);
    await vi.waitFor(async () => expect(await on_disk(kernel)).toEqual([]));
    expect(toasts(kernel)).toEqual([]);
  });

  test("a device from before keeps what it used, once, with Undo", async () => {
    await write(VERSION_STATE_PATH, serialize_seen("1.0.0"));
    await write("/var/lib/session/session.json", serialize_session({ windows: [], frames: { clock: { x: 0, y: 0, width: 300, height: 200 } } }));
    localStorage.setItem("app.snake.best", "12");
    const kernel = await boot();

    expect(apps(kernel).is_installed("clock")).toBe(true);
    expect(apps(kernel).is_installed("snake")).toBe(true);
    expect(apps(kernel).is_installed("kanban")).toBe(false);
    expect(apps(kernel).is_installed("settings")).toBe(true);
    await vi.waitFor(async () => expect(await on_disk(kernel)).toEqual(["clock", "snake"]));

    const toast = kernel.service<NotificationsService>("notifications").all[0];
    expect(toast.title).toMatch(/^Tidied \d+ apps you never opened$/);
    toast.actions!.find((action) => action.label === "Undo")!.on_click();
    expect(user_apps(kernel).every((id) => apps(kernel).is_installed(id))).toBe(true);
  });

  test("a saved list loads as is and drops unknown ids", async () => {
    await write(INSTALLED_PATH, serialize_installed(["kanban", "gone"]));
    const kernel = await boot();
    expect([...apps(kernel).list({ installed: true })].filter(([, manifest]) => !manifest.system).map(([id]) => id)).toEqual(["kanban"]);
    expect([...apps(kernel).list({ installed: false })].map(([id]) => id)).toContain("clock");
  });

  test("launching an app that isn't installed installs it, with a toast", async () => {
    await write(INSTALLED_PATH, serialize_installed([]));
    const kernel = await boot();
    apps(kernel).launch("example");
    expect(apps(kernel).is_installed("example")).toBe(true);
    expect(toasts(kernel)).toEqual(["Example installed"]);
    await vi.waitFor(async () => expect(await on_disk(kernel)).toEqual(["example"]));
  });

  test("uninstall keeps data unless asked; system apps refuse", async () => {
    await write(INSTALLED_PATH, serialize_installed(["clock", "kanban"]));
    await write("/var/lib/apps/kanban/board.json", "{}");
    localStorage.setItem("app.kanban.view", "board");
    localStorage.setItem("app.clock.zone", "UTC");
    const kernel = await boot();
    const files = kernel.service<FilesService>("files");

    await apps(kernel).uninstall("clock");
    expect(apps(kernel).is_installed("clock")).toBe(false);
    expect(localStorage.getItem("app.clock.zone")).toBe("UTC");

    await apps(kernel).uninstall("kanban", { data: true });
    expect(localStorage.getItem("app.kanban.view")).toBeNull();
    expect(await files.get_directory("/var/lib/apps/kanban")).toBeNull();
    await vi.waitFor(async () => expect(await on_disk(kernel)).toEqual([]));

    await expect(apps(kernel).uninstall("settings")).rejects.toThrow(/can't be uninstalled/);
  });

  test("an app's shell commands need it installed", async () => {
    await write(INSTALLED_PATH, serialize_installed([]));
    const kernel = await boot();
    const contribution = apps(kernel).shell!();
    const commands = contribution.commands ?? [];
    const command = ((await contribution.lazy!()).commands ?? []).find((candidate) => candidate.app === "quick-notes")!;
    expect(command.available?.()).toBe("Quick Notes isn't installed. Get it in the App Library");
    apps(kernel).install("quick-notes");
    expect(command.available?.() ?? true).toBe(true);
    expect(() => commands.find((candidate) => candidate.id === "app launch")!.run({ args: { id: "clock" } } as never)).toThrow(/isn't installed/);
  });
});

describe("AppsService recent apps", () => {
  async function recent_on_disk(kernel: Kernel): Promise<string[]> {
    const file = await kernel.service<FilesService>("files").get_file(RECENT_PATH);
    return parse_recent(file ? await file.text() : null);
  }

  test("launch records user apps newest first, once each; system apps never", async () => {
    await write(INSTALLED_PATH, serialize_installed(["clock", "kanban"]));
    const kernel = await boot();
    apps(kernel).launch("clock");
    apps(kernel).launch("settings");
    apps(kernel).launch("kanban");
    apps(kernel).launch("clock");
    expect(apps(kernel).recent).toEqual(["clock", "kanban"]);
    await vi.waitFor(async () => expect(await recent_on_disk(kernel)).toEqual(["clock", "kanban"]));
  });

  test("the saved list loads, dropping system, unknown and uninstalled apps", async () => {
    await write(INSTALLED_PATH, serialize_installed(["clock", "kanban"]));
    await write(RECENT_PATH, serialize_recent(["gone", "kanban", "settings", "snake", "clock"]));
    const kernel = await boot();
    expect(apps(kernel).recent).toEqual(["kanban", "clock"]);

    await apps(kernel).uninstall("kanban");
    expect(apps(kernel).recent).toEqual(["clock"]);
    apps(kernel).install("kanban");
    expect(apps(kernel).recent).toEqual(["kanban", "clock"]);
  });

  test("clear_recent empties and saves the list", async () => {
    await write(INSTALLED_PATH, serialize_installed(["clock"]));
    await write(RECENT_PATH, serialize_recent(["clock"]));
    const kernel = await boot();
    apps(kernel).clear_recent();
    expect(apps(kernel).recent).toEqual([]);
    await vi.waitFor(async () => expect(await recent_on_disk(kernel)).toEqual([]));
  });

  test("app recent yields the list; --clear forgets it", async () => {
    await write(INSTALLED_PATH, serialize_installed(["clock", "kanban"]));
    await write(RECENT_PATH, serialize_recent(["kanban", "clock"]));
    const kernel = await boot();
    const command = (apps(kernel).shell!().commands ?? []).find((candidate) => candidate.id === "app recent")!;
    const yielded: unknown[] = [];
    for await (const value of command.run({ args: { clear: false } } as never) as AsyncIterable<unknown>) yielded.push(value);
    expect(yielded).toMatchObject([{ $type: "app", id: "kanban" }, { $type: "app", id: "clock" }]);

    for await (const _ of command.run({ args: { clear: true } } as never) as AsyncIterable<unknown>);
    expect(apps(kernel).recent).toEqual([]);
  });
});

describe("AppsService meta (ADR-049)", () => {
  test("every app's meta loads once; an app without one, or an unknown id, resolves {}", async () => {
    const kernel = await boot();
    const service = apps(kernel);
    service.register({ ...service.get("example")!, id: "no-meta", meta: undefined });
    expect(service.meta_ready).toBe(service.meta_ready);
    expect(await service.meta("example")).toEqual({ description: "Test app" });
    expect((await service.meta("settings")).description).toBeTruthy();
    expect(await service.meta("no-meta")).toEqual({});
    expect(await service.meta("nope")).toEqual({});
  });

  test("listings() merges each manifest with its meta once loaded, and filters like list()", async () => {
    const kernel = await boot();
    const service = apps(kernel);
    await service.meta_ready;
    const listing = (id: string) => service.listings().find((candidate) => candidate.id === id);
    expect(listing("example")).toMatchObject({ id: "example", name: "Example", description: "Test app" });
    expect(listing("settings")?.description).toBeTruthy();
    expect(service.listings().map(({ id }) => id)).toEqual([...service.list()].map(([id]) => id));
    expect(service.listings({ installed: true }).every(({ id }) => service.is_installed(id))).toBe(true);
    expect(service.listings({ installed: false }).some(({ id }) => service.is_installed(id))).toBe(false);
  });
});
