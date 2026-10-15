import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Kernel } from "$lib/core/api";
import { boot_test_kernel, stub_service } from "../../kernel/test-kernel";
import * as opfs from "../files/opfs";
import { FilesService } from "../files/service.svelte";
import { NotificationsService } from "../notifications/service.svelte";
import { VERSION_STATE_PATH, parse_seen, serialize_seen } from "./persistence";
import { VersionService } from "./service.svelte";

declare const __VERSION_INFO__: { version: string };
const current = __VERSION_INFO__.version;

let shutdown: () => void;
let show: ReturnType<typeof vi.fn>;

async function boot(seen?: string): Promise<Kernel> {
  if (seen) {
    const files = new FilesService();
    await files.init();
    const [directory, name] = [VERSION_STATE_PATH.slice(0, VERSION_STATE_PATH.lastIndexOf("/")), "state.json"];
    let handle = await files.get_root();
    for (const segment of directory.split("/").filter(Boolean))
      handle = await handle.getDirectoryHandle(segment, { create: true });
    await opfs.write_file(await handle.getFileHandle(name, { create: true }), serialize_seen(seen));
  }

  show = vi.fn(async () => undefined);
  const booted = await boot_test_kernel({
    files: FilesService,
    notifications: NotificationsService,
    dialogs: stub_service("dialogs", { show }),
    apps: stub_service("apps", { launch: vi.fn() }),
    version: VersionService,
  });
  shutdown = booted.shutdown;
  return booted.kernel;
}

async function seen_on_disk(kernel: Kernel): Promise<string | null> {
  const file = await kernel.service<FilesService>("files").get_file(VERSION_STATE_PATH);
  return file ? parse_seen(await file.text()) : null;
}

beforeEach(() => opfs.clear_opfs());
afterEach(() => shutdown?.());

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
    expect(show).not.toHaveBeenCalled();
    await vi.waitFor(async () => expect(await seen_on_disk(kernel)).toBe(current));
  });

  test("the current version already seen does nothing", async () => {
    const kernel = await boot(current);
    expect(kernel.service<VersionService>("version").unseen).toEqual([]);
    expect(kernel.service<NotificationsService>("notifications").all).toHaveLength(0);
    expect(show).not.toHaveBeenCalled();
  });
});
