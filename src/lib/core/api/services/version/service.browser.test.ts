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
import { SETTINGS_PATH } from "../settings/persistence";
import { WindowsService } from "../windows/service.svelte";
import { VERSION_STATE_PATH, parse_seen, serialize_seen } from "./persistence";
import { INSTALLED_PATH, serialize_installed } from "../apps/installed";
import { VersionService } from "./service.svelte";
import type { Release } from "./type";

declare const __VERSION_INFO__: { version: string };
const current = __VERSION_INFO__.version;

// A fixture, not the real release notes: the apps those introduce are gone in a fork.
vi.mock("./changelog", () => {
  const release = (version: string, introduces?: string[]): Release => ({
    version,
    date: "2026-01-01",
    title: version,
    changes: [{ kind: "improved", text: `Release ${version}.` }],
    introduces,
  });
  return { CHANGELOG: [release(__VERSION_INFO__.version), release("1.2.0", ["example", "gone"]), release("1.1.0"), release("1.0.0")] };
});

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

async function boot(seen?: string, { restore, intro }: { restore?: Promise<boolean>; intro?: Promise<void> } = {}): Promise<Kernel> {
  if (seen) {
    await write(VERSION_STATE_PATH, serialize_seen(seen));
    // Past the move to installed apps, so AppsService doesn't tidy and toast (ADR-040).
    await write(INSTALLED_PATH, serialize_installed([]));
  }
  if (restore) {
    const window = { app_id: "example", props: undefined, bounds: { x: 0, y: 0, width: 400, height: 300 }, flags: [], snap_zone: null, state: undefined };
    await write("/var/lib/session/session.json", serialize_session({ windows: [window], frames: {} }));
  }

  show = vi.fn(async (_component: unknown, props: AnyProps) => (is_announcement(props) ? undefined : (intro ?? restore ?? false)));
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
const ASK = "Share which apps you open?";
const asks = (kernel: Kernel) => kernel.service<NotificationsService>("notifications").all.filter((item) => item.title === ASK);
const others = (kernel: Kernel) => kernel.service<NotificationsService>("notifications").all.filter((item) => item.title !== ASK);
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
    expect(others(kernel)).toHaveLength(0);
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

  test("apps an unseen release introduces are announced once the Restore question is answered", async () => {
    let answer!: (restore: boolean) => void;
    const restore = new Promise<boolean>((resolve) => (answer = resolve));
    const kernel = await boot("1.1.0", { restore });
    const version = kernel.service<VersionService>("version");

    expect(version.announced.every(({ release }) => release.version !== "1.1.0")).toBe(true);
    await vi.waitFor(() => expect(show).toHaveBeenCalledOnce());
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(announcements()).toEqual([]);

    answer(false);
    await vi.waitFor(() => expect(announcements()).toHaveLength(1));
    // An app the catalogue doesn't have (a fork without it) is left out.
    expect(version.announced).toEqual([expect.objectContaining({ app: "example", release: expect.objectContaining({ version: "1.2.0" }) })]);
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
    expect(others(kernel)).toHaveLength(0);
    expect(show).not.toHaveBeenCalled();
  });
});

describe("usage stats ask", () => {
  test("first boot asks once the introduction is closed", async () => {
    let close!: () => void;
    const closed = new Promise<void>((resolve) => (close = resolve));
    const kernel = await boot(undefined, { intro: closed });
    await vi.waitFor(() => expect(show).toHaveBeenCalled());
    expect(asks(kernel)).toHaveLength(0);
    close();
    await vi.waitFor(() => expect(asks(kernel)).toHaveLength(1));
  });

  test("waits for the Restore answer, then Allow keeps the answer", async () => {
    let answer!: (restore: boolean) => void;
    const restore = new Promise<boolean>((resolve) => (answer = resolve));
    const kernel = await boot(current, { restore });
    await vi.waitFor(() => expect(show).toHaveBeenCalledOnce());
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(asks(kernel)).toHaveLength(0);

    answer(false);
    await vi.waitFor(() => expect(asks(kernel)).toHaveLength(1));
    const [ask] = asks(kernel);
    expect(ask.duration).toBeNull();
    ask.actions?.find((action) => action.label === "Allow")?.on_click();
    expect(kernel.service<SettingsService>("settings").analytics).toBe("allowed");
    await vi.waitFor(() => expect(localStorage.getItem("webos.analytics")).toBe("allowed"));
  });

  test("an answered question isn't asked again", async () => {
    await write(SETTINGS_PATH, JSON.stringify({ version: 1, analytics: "declined" }));
    const kernel = await boot(current);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(asks(kernel)).toHaveLength(0);
  });
});

describe("VersionService update check", () => {
  afterEach(() => vi.restoreAllMocks());

  test("offline or unreachable stays quiet; a broken version.json is still logged", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetch = vi.spyOn(window, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    const version = (await boot(current)).service<VersionService>("version");
    await vi.waitFor(() => expect(version.is_checking).toBe(false));
    await version.check();
    expect(fetch).toHaveBeenCalled();
    expect(error).not.toHaveBeenCalledWith("Failed to check for updates:", expect.anything());

    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    fetch.mockClear();
    await version.check();
    expect(fetch).not.toHaveBeenCalled();

    online.mockRestore();
    fetch.mockResolvedValue(new Response("not json"));
    await version.check();
    expect(error).toHaveBeenCalledWith("Failed to check for updates:", expect.any(SyntaxError));
  });
});
