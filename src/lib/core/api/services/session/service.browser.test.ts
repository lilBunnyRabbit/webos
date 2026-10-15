import { flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Kernel } from "$lib/core/api";
import { boot_test_kernel, stub_service } from "../../kernel/test-kernel";
import { AppsService } from "../apps/service.svelte";
import { TestAppsService } from "../apps/test-apps";
import * as opfs from "../files/opfs";
import { FilesService } from "../files/service.svelte";
import { NotificationsService } from "../notifications/service.svelte";
import { SettingsService } from "../settings/service.svelte";
import { WindowFlag, type WindowFrames, type WindowSnapshot } from "../windows/type";
import { WindowsService } from "../windows/service.svelte";
import { SESSION_PATH, parse_session, serialize_session, type SessionFile } from "./persistence";
import { SessionService } from "./service.svelte";
import { SessionStatus } from "./type";

const settings_window: WindowSnapshot = {
  app_id: "settings",
  props: { section: "about" },
  bounds: { x: 20, y: 20, width: 640, height: 480 },
  flags: [],
  snap_zone: null,
  state: { section: "whats-new" },
};
const example_window: WindowSnapshot = { ...settings_window, app_id: "example", props: undefined, state: undefined, flags: [WindowFlag.MINIMIZED] };

let shutdown: () => void;

async function boot(saved: WindowSnapshot[] | null, answer = true, frames: WindowFrames = {}): Promise<Kernel> {
  if (saved) {
    const files = new FilesService();
    await files.init();
    let handle = await files.get_root();
    for (const segment of ["var", "lib", "session"]) handle = await handle.getDirectoryHandle(segment, { create: true });
    await opfs.write_file(await handle.getFileHandle("session.json", { create: true }), serialize_session({ windows: saved, frames }));
  }

  const booted = await boot_test_kernel({
    files: FilesService,
    settings: SettingsService,
    windows: WindowsService,
    notifications: NotificationsService,
    dialogs: stub_service("dialogs", { show: vi.fn(async () => answer) }),
    apps: TestAppsService,
    session: SessionService,
  });
  shutdown = booted.shutdown;
  return booted.kernel;
}

const session = (kernel: Kernel) => kernel.service<SessionService>("session");
const windows = (kernel: Kernel) => kernel.service<WindowsService>("windows");

async function saved_file(kernel: Kernel): Promise<SessionFile> {
  const file = await kernel.service<FilesService>("files").get_file(SESSION_PATH);
  return file ? parse_session(await file.text()) : { windows: [], frames: {} };
}

const saved_on_disk = async (kernel: Kernel) => (await saved_file(kernel)).windows;

beforeEach(() => opfs.clear_opfs());
afterEach(() => shutdown?.());

describe("SessionService", () => {
  test("with nothing saved, open windows are written as they change", async () => {
    const kernel = await boot(null);
    expect(session(kernel).status).toBe(SessionStatus.NONE);

    kernel.service<AppsService>("apps").launch("example");
    flushSync();
    await vi.waitFor(async () => expect((await saved_on_disk(kernel)).map((w) => w.app_id)).toEqual(["example"]));
  });

  test("restore reopens windows in order with props, flags and window state", async () => {
    const kernel = await boot([example_window, settings_window]);
    await vi.waitFor(() => expect(session(kernel).status).toBe(SessionStatus.RESTORED));

    const restored = windows(kernel).sorted_list(([, a], [, b]) => a.order - b.order).map(([, w]) => w);
    expect(restored.map((w) => w.app.id)).toEqual(["example", "settings"]);
    expect(restored[0].flags.has(WindowFlag.MINIMIZED)).toBe(true);
    expect(restored[1].app.props).toEqual({ section: "about" });
    expect(restored[1].app.state).toEqual({ section: "whats-new" });
  });

  test("declining opens nothing, and the empty desktop is saved only after the answer", async () => {
    const kernel = await boot([settings_window], false);
    await vi.waitFor(() => expect(session(kernel).status).toBe(SessionStatus.DECLINED));
    expect(windows(kernel).list()).toEqual([]);
    flushSync();
    await vi.waitFor(async () => expect(await saved_on_disk(kernel)).toEqual([]));
  });

  test("a window whose app is gone is skipped with a warning", async () => {
    const kernel = await boot([{ ...example_window, app_id: "no-such-app" }, settings_window]);
    await vi.waitFor(() => expect(session(kernel).status).toBe(SessionStatus.RESTORED));
    expect(windows(kernel).list()).toHaveLength(1);
    const [warning] = kernel.service<NotificationsService>("notifications").all;
    expect(warning.type).toBe("warning");
  });

  test("frames load whatever the answer, and closing a window records and saves its frame", async () => {
    // Small enough to fit the test page, so it isn't clamped.
    const frame = { x: 10, y: 20, width: 300, height: 200 };
    const kernel = await boot([settings_window], false, { example: frame });
    await vi.waitFor(() => expect(session(kernel).status).toBe(SessionStatus.DECLINED));
    expect(windows(kernel).frames).toEqual({ example: frame });

    const id = kernel.service<AppsService>("apps").launch("example")!;
    expect(windows(kernel).get(id)?.bounds).toEqual(frame);

    windows(kernel).get(id)!.bounds = { ...frame, x: 30 };
    windows(kernel).close(id);
    flushSync();
    await vi.waitFor(async () => expect((await saved_file(kernel)).frames).toEqual({ example: { ...frame, x: 30 } }));
  });

  test("closed windows stack newest first and reopen with their state, un-minimized", async () => {
    const kernel = await boot([example_window, settings_window]);
    await vi.waitFor(() => expect(session(kernel).status).toBe(SessionStatus.RESTORED));
    flushSync();

    const [example_id, settings_id] = windows(kernel)
      .sorted_list(([, a], [, b]) => a.order - b.order)
      .map(([id]) => id);
    windows(kernel).close(example_id);
    flushSync();
    windows(kernel).close(settings_id);
    flushSync();
    expect(session(kernel).closed.map((w) => w.app_id)).toEqual(["settings", "example"]);

    session(kernel).reopen_closed();
    flushSync();
    const example = session(kernel).reopen_closed();
    flushSync();
    expect(session(kernel).closed).toEqual([]);
    expect(windows(kernel).get(example!)?.flags.has(WindowFlag.MINIMIZED)).toBe(false);
    expect(windows(kernel).is_focused(example!)).toBe(true);
    const settings = windows(kernel).list().find((id) => windows(kernel).get(id)?.app.id === "settings")!;
    expect(windows(kernel).get(settings)?.app.state).toEqual({ section: "whats-new" });
    expect(session(kernel).reopen_closed()).toBeNull();
  });
});
