import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Kernel } from "$lib/core/api";
import { boot_test_kernel, stub_service } from "../../kernel/test-kernel";
import { AppsService } from "../apps/service.svelte";
import { TestAppsService } from "../apps/test-apps";
import { ClipboardService } from "../clipboard/service.svelte";
import * as opfs from "../files/opfs";
import { FilesService } from "../files/service.svelte";
import { NotificationsService } from "../notifications/service.svelte";
import { serialize_session } from "../session/persistence";
import { SessionService } from "../session/service.svelte";
import { SettingsService } from "../settings/service.svelte";
import { WindowsService } from "../windows/service.svelte";
import type { WindowSnapshot } from "../windows/type";
import { RouterService } from "./service.svelte";
import { LinkOutcome } from "./type";

const saved: WindowSnapshot = {
  app_id: "example",
  props: undefined,
  bounds: { x: 20, y: 20, width: 640, height: 480 },
  flags: [],
  snap_zone: null,
  state: undefined,
};

let shutdown: () => Promise<void>;

async function boot(answer: Promise<boolean> | null = null): Promise<Kernel> {
  if (answer) {
    const files = new FilesService();
    await files.init();
    let handle = await files.get_root();
    for (const segment of ["var", "lib", "session"]) handle = await handle.getDirectoryHandle(segment, { create: true });
    await opfs.write_file(await handle.getFileHandle("session.json", { create: true }), serialize_session({ windows: [saved], frames: {} }));
  }

  const booted = await boot_test_kernel({
    files: FilesService,
    settings: SettingsService,
    windows: WindowsService,
    notifications: NotificationsService,
    dialogs: stub_service("dialogs", { show: vi.fn(() => answer ?? Promise.resolve(false)) }),
    apps: TestAppsService,
    session: SessionService,
    clipboard: ClipboardService,
    router: RouterService,
  });
  shutdown = booted.shutdown;
  return booted.kernel;
}

const windows = (kernel: Kernel) => kernel.service<WindowsService>("windows");
const router = (kernel: Kernel) => kernel.service<RouterService>("router");
const open_apps = (kernel: Kernel) =>
  windows(kernel)
    .sorted_list(([, a], [, b]) => a.order - b.order)
    .map(([, w]) => [w.app.id, w.app.props]);

beforeEach(async () => {
  // The previous test's session save can still hold session.json open.
  await vi.waitFor(() => opfs.clear_opfs());
  history.replaceState(null, "", location.pathname + location.search);
});
afterEach(async () => await shutdown?.());

describe("RouterService", () => {
  test("a link opens its app with typed props and clears the hash", async () => {
    location.hash = "#/app/example?count=3";
    const kernel = await boot();

    await vi.waitFor(() => expect(open_apps(kernel)).toEqual([["example", { count: 3 }]]));
    expect(location.hash).toBe("");
    expect(router(kernel).last_link).toEqual({ hash: "#/app/example?count=3", outcome: LinkOutcome.OPENED });
  });

  test("waits for the Restore answer, then opens on top of the restored windows", async () => {
    let resolve!: (answer: boolean) => void;
    const promise = new Promise<boolean>((done) => (resolve = done));
    location.hash = "#/app/settings?section=about";
    const kernel = await boot(promise);
    expect(open_apps(kernel)).toEqual([]);

    resolve(true);
    await vi.waitFor(() => expect(open_apps(kernel)).toEqual([["example", undefined], ["settings", { section: "about" }]]));
    expect(location.hash).toBe("");
  });

  test("a link to a replaced app opens the app that took it over (ADR-071)", async () => {
    location.hash = "#/app/old-games?mode=count&count=3";
    const kernel = await boot();
    await vi.waitFor(() => expect(open_apps(kernel)).toEqual([["example", { count: 3 }]]));

    location.hash = "#/app/old-games";
    await vi.waitFor(() => expect(open_apps(kernel)).toEqual([["example", { count: 3 }], ["game", undefined]]));
  });

  test("an unknown app or props that fail the schema open nothing", async () => {
    const kernel = await boot();

    location.hash = "#/app/nope";
    await vi.waitFor(() => expect(router(kernel).last_link?.outcome).toBe(LinkOutcome.UNKNOWN_APP));
    location.hash = "#/app/example?count=lots";
    await vi.waitFor(() => expect(router(kernel).last_link?.outcome).toBe(LinkOutcome.INVALID_PROPS));
    expect(open_apps(kernel)).toEqual([]);
  });

  test("links every window, leaving out the file it has open", async () => {
    const kernel = await boot();
    const apps = kernel.service<AppsService>("apps");

    const example = apps.launch("example", { count: 2 });
    const viewer = apps.launch("text-editor", { path: "/home/a.txt" });
    expect(router(kernel).link_for(example)).toBe(`${location.origin}${location.pathname}#/app/example?count=2`);
    expect(router(kernel).link_for(viewer)).toBe(`${location.origin}${location.pathname}#/app/text-editor`);
  });
});
