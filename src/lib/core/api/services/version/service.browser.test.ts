import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Kernel } from "$lib/core/api";
import { boot_test_kernel, stub_service } from "../../kernel/test-kernel";
import { TestAppsService } from "../apps/test-apps";
import * as opfs from "../files/opfs";
import { FilesService } from "../files/service.svelte";
import { NotificationsService } from "../notifications/service.svelte";
import { serialize_session } from "../session/persistence";
import { SessionService } from "../session/service.svelte";
import { SettingsService } from "../settings/service.svelte";
import { WindowsService } from "../windows/service.svelte";
import { VERSION_STATE_PATH, parse_seen, serialize_seen } from "./persistence";
import { INSTALLED_PATH, serialize_installed } from "../apps/installed";
import { VersionService } from "./service.svelte";

declare const __VERSION_INFO__: { version: string };
const current = __VERSION_INFO__.version;

let shutdown: () => Promise<void>;
let show: ReturnType<typeof vi.fn>;

async function write(path: string, text: string) {
  const files = new FilesService();
  await files.init();
  const [directory, name] = [path.slice(0, path.lastIndexOf("/")), path.slice(path.lastIndexOf("/") + 1)];
  let handle = await files.get_root();
  for (const segment of directory.split("/").filter(Boolean)) handle = await handle.getDirectoryHandle(segment, { create: true });
  await opfs.write_file(await handle.getFileHandle(name, { create: true }), text);
}

async function boot(seen?: string, { restore }: { restore?: Promise<boolean> } = {}): Promise<Kernel> {
  if (seen) {
    await write(VERSION_STATE_PATH, serialize_seen(seen));
    // Past the move to installed apps, so AppsService doesn't tidy and toast (ADR-040).
    await write(INSTALLED_PATH, serialize_installed([]));
  }
  if (restore) {
    const window = { app_id: "example", props: undefined, bounds: { x: 0, y: 0, width: 400, height: 300 }, flags: [], snap_zone: null, state: undefined };
    await write("/var/lib/session/session.json", serialize_session({ windows: [window], frames: {} }));
  }

  show = vi.fn(async (_component: unknown, props: AnyProps) => (is_announcement(props) ? undefined : (restore ?? false)));
  const booted = await boot_test_kernel({
    files: FilesService,
    settings: SettingsService,
    windows: WindowsService,
    notifications: NotificationsService,
    dialogs: stub_service("dialogs", { show }),
    apps: TestAppsService,
    session: SessionService,
    version: VersionService,
  });
  shutdown = booted.shutdown;
  return booted.kernel;
}

interface AnyProps {
  apps?: ({ manifest?: { id: string }; version?: string } | null)[];
}

const is_announcement = (props: AnyProps) => Boolean(props.apps?.[0]?.manifest);
const announcements = () => show.mock.calls.map(([, props]) => props as AnyProps).filter(is_announcement);

async function seen_on_disk(kernel: Kernel): Promise<string | null> {
  const file = await kernel.service<FilesService>("files").get_file(VERSION_STATE_PATH);
  return file ? parse_seen(await file.text()) : null;
}

beforeEach(() => vi.waitFor(() => opfs.clear_opfs()));
afterEach(async () => await shutdown?.());

describe("VersionService at boot", () => {
  test("first boot shows the introduction, then marks the current version seen", async () => {
    const kernel = await boot();
    await vi.waitFor(() => expect(show).toHaveBeenCalledOnce());
    await vi.waitFor(async () => expect(await seen_on_disk(kernel)).toBe(current));
    expect(kernel.service<NotificationsService>("notifications").all).toHaveLength(0);
  });

  test("an older seen version lists what's new and posts the Updated toast", async () => {
    const kernel = await boot("0.1.0");
    const version = kernel.service<VersionService>("version");
    expect(version.unseen.length).toBeGreaterThan(0);
    expect(version.unseen[0].version).toBe(current);
    expect(version.unseen.every((release) => release.version !== "0.1.0")).toBe(true);

    const [toast] = kernel.service<NotificationsService>("notifications").all;
    expect(toast.title).toContain(current);
    await vi.waitFor(() => expect(announcements()).toHaveLength(1));
    expect(show).toHaveBeenCalledOnce();
    await vi.waitFor(async () => expect(await seen_on_disk(kernel)).toBe(current));
  });

  test("first boot announces no apps", async () => {
    const kernel = await boot();
    await vi.waitFor(() => expect(show).toHaveBeenCalledOnce());
    expect(kernel.service<VersionService>("version").announced).toEqual([]);
    expect(announcements()).toEqual([]);
  });

  // Image Tools came in 1.2.0, so a device that last saw 1.1.0 is told about it.
  test("apps an unseen release introduces are announced once the Restore question is answered", async () => {
    let answer!: (restore: boolean) => void;
    const restore = new Promise<boolean>((resolve) => (answer = resolve));
    const kernel = await boot("1.1.0", { restore });
    const version = kernel.service<VersionService>("version");

    expect(version.announced).toContainEqual(expect.objectContaining({ app: "image-tools", release: expect.objectContaining({ version: "1.2.0" }) }));
    expect(version.announced.every(({ release }) => release.version !== "1.1.0")).toBe(true);
    await vi.waitFor(() => expect(show).toHaveBeenCalledOnce());
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(announcements()).toEqual([]);

    answer(false);
    await vi.waitFor(() => expect(announcements()).toHaveLength(1));
    const [props] = announcements();
    expect(props.apps?.map((app) => [app?.manifest?.id, app?.version])).toEqual(
      version.announced.map(({ app, release }) => [app, release.version])
    );
  });

  test("with no session to restore, the announcement shows right away", async () => {
    await boot("1.1.0");
    await vi.waitFor(() => expect(announcements()).toHaveLength(1));
  });

  test("the current version already seen does nothing", async () => {
    const kernel = await boot(current);
    expect(kernel.service<VersionService>("version").unseen).toEqual([]);
    expect(kernel.service<NotificationsService>("notifications").all).toHaveLength(0);
    expect(show).not.toHaveBeenCalled();
  });
});
