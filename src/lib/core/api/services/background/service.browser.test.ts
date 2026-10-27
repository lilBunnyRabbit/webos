import { z } from "zod";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { boot_test_kernel, stub_service } from "../../kernel/test-kernel";
import * as opfs from "../files/opfs";
import { FilesService } from "../files/service.svelte";
import { NotificationsService } from "../notifications/service.svelte";
import { SessionStatus } from "../session/type";
import FixtureWorker from "$lib/core/utils/worker/fixture.worker?worker";
import type { FixtureApi } from "$lib/core/utils/worker/fixture.worker";
import { BACKGROUND_PATH, parse_state } from "./persistence";
import { BackgroundService, lock_name } from "./service.svelte";
import type { BackgroundRun } from "./type";

interface Tab {
  background: BackgroundService;
  notifications: NotificationsService;
  files: FilesService;
  shutdown: () => Promise<void>;
}

const shutdowns: Array<() => Promise<void>> = [];
let runs: Record<string, BackgroundRun> = {};

const manifest = (id: string) =>
  id in runs ? { id, name: id === "watch" ? "Watcher" : id, props: z.object({ zone: z.string().optional() }), background: async () => ({ default: runs[id] }) } : undefined;

async function open_tab(): Promise<Tab> {
  const booted = await boot_test_kernel({
    files: FilesService,
    notifications: NotificationsService,
    apps: stub_service("apps", { load: async (id: string) => manifest(id) as never, get: (id: string) => manifest(id) as never }),
    session: stub_service("session", { status: SessionStatus.NONE }),
    background: BackgroundService,
  });
  let closed = false;
  const shutdown = async () => {
    if (closed) return;
    closed = true;
    await booted.shutdown();
  };
  shutdowns.push(shutdown);
  return {
    background: booted.kernel.service<BackgroundService>("background"),
    notifications: booted.kernel.service<NotificationsService>("notifications"),
    files: booted.kernel.service<FilesService>("files"),
    shutdown,
  };
}

function until_stopped(log: string[], extra?: BackgroundRun): BackgroundRun {
  return async (context) => {
    log.push("start");
    const stopped = new Promise<void>((resolve) => context.signal.addEventListener("abort", () => resolve(), { once: true }));
    context.status("Watching");
    await extra?.(context);
    await stopped;
    log.push("stop");
  };
}

async function saved(tab: Tab) {
  const file = await tab.files.get_file(BACKGROUND_PATH);
  return parse_state(file ? await file.text() : null);
}

beforeEach(async () => {
  await opfs.clear_opfs();
  runs = {};
});

afterEach(async () => {
  for (const shutdown of shutdowns.splice(0)) await shutdown();
  // A destroyed tab's job lets go of its lock a moment later; the next test starts the same app.
  await navigator.locks.request(lock_name("watch"), () => {});
});

describe("BackgroundService", () => {
  test("runs an app's job with no window until stopped", async () => {
    const log: string[] = [];
    runs.watch = until_stopped(log);
    const tab = await open_tab();
    expect(await tab.background.start("watch")).toBe(true);
    await vi.waitFor(() => expect(tab.background.get("watch")?.status).toBe("Watching"));
    expect(tab.background.get("watch")?.here).toBe(true);
    expect(await tab.background.start("watch")).toBe(true);
    expect(await tab.background.stop("watch")).toBe(true);
    expect(log).toEqual(["start", "stop"]);
    expect(tab.background.list()).toEqual([]);
    expect(await tab.background.stop("watch")).toBe(false);
  });

  test("one job per app per browser: a second tab sees it running elsewhere and can stop it", async () => {
    const log: string[] = [];
    runs.watch = until_stopped(log);
    const one = await open_tab();
    const two = await open_tab();
    expect(await one.background.start("watch")).toBe(true);
    expect(await two.background.start("watch")).toBe(false);
    await vi.waitFor(() => expect(two.background.get("watch")).toMatchObject({ here: false, tab: one.background.tab, status: "Watching" }));
    expect(await two.background.stop("watch")).toBe(true);
    await vi.waitFor(() => expect(log).toEqual(["start", "stop"]));
    await vi.waitFor(() => expect(two.background.list()).toEqual([]));
  });

  test("a tab that closes takes its job off the others' lists", async () => {
    runs.watch = until_stopped([]);
    const one = await open_tab();
    const two = await open_tab();
    await one.background.start("watch");
    await vi.waitFor(() => expect(two.background.get("watch")).toBeDefined());
    await one.shutdown();
    await vi.waitFor(() => expect(two.background.list()).toEqual([]));
    expect(await two.background.start("watch")).toBe(true);
  });

  test("workers from ctx.spawn are listed under the job and end with it", async () => {
    let worker: { alive: boolean } | null = null;
    runs.watch = until_stopped([], async (context) => {
      const handle = context.spawn<FixtureApi>(FixtureWorker, { name: "detector" });
      worker = handle;
      expect(await handle.call("double", 4)).toBe(8);
    });
    const tab = await open_tab();
    await tab.background.start("watch");
    await vi.waitFor(() => expect(tab.background.get("watch")?.workers.map((entry) => entry.name)).toEqual(["detector"]));
    await tab.background.stop("watch");
    expect(worker!.alive).toBe(false);
  });

  test("Start right after Stop waits for the old job and runs a new one", async () => {
    const log: string[] = [];
    const watch = until_stopped(log);
    runs.watch = async (context) => {
      await watch(context);
      await new Promise((resolve) => setTimeout(resolve, 100));
    };
    const one = await open_tab();
    const two = await open_tab();
    await one.background.start("watch");
    const stopping = one.background.stop("watch");
    await vi.waitFor(() => expect(two.background.get("watch")?.status).toBe("Stopping"));
    expect(await one.background.start("watch")).toBe(true);
    await stopping;
    expect(log).toEqual(["start", "stop", "start"]);
    expect(one.background.get("watch")).toMatchObject({ here: true, status: "Watching" });
  });

  test("another tab sees the job until its lock is free", async () => {
    runs.watch = async (context) => {
      await new Promise<void>((resolve) => context.signal.addEventListener("abort", () => resolve(), { once: true }));
      await new Promise((resolve) => setTimeout(resolve, 100));
    };
    const one = await open_tab();
    const two = await open_tab();
    await one.background.start("watch");
    await vi.waitFor(() => expect(two.background.get("watch")).toBeDefined());
    const stopped = one.background.stop("watch");
    await vi.waitFor(() => expect(two.background.get("watch")?.status).toBe("Stopping"));
    await vi.waitFor(() => expect(two.background.list()).toEqual([]));
    expect(await two.background.start("watch")).toBe(true);
    await stopped;
  });

  test("a job that throws is reported and taken off the list", async () => {
    runs.watch = async () => {
      throw new Error("No camera");
    };
    const tab = await open_tab();
    await tab.background.start("watch");
    await vi.waitFor(() => expect(tab.background.list()).toEqual([]));
    expect(tab.notifications.all[0]).toMatchObject({ title: "Watcher stopped", message: "No camera" });
  });

  test("a resumable job closed with the page is offered again, and Resume starts it", async () => {
    runs.watch = until_stopped([], async (context) => void (await context.resumable()));
    const one = await open_tab();
    await one.background.start("watch", { zone: "door" });
    await vi.waitFor(async () => expect((await saved(one)).resume.watch?.props).toEqual({ zone: "door" }));
    await one.shutdown();

    const log: string[] = [];
    runs.watch = until_stopped(log);
    const two = await open_tab();
    const offer = await vi.waitFor(() => {
      const found = two.notifications.all.find((notification) => notification.title === "Resume Watcher?");
      expect(found).toBeDefined();
      return found!;
    });
    offer.actions!.find((action) => action.label === "Resume")!.on_click();
    await vi.waitFor(() => expect(log).toEqual(["start"]));
    await two.background.stop("watch");
    await vi.waitFor(async () => expect((await saved(two)).resume).toEqual({}));
  });

  test("a job stopped on purpose isn't offered again", async () => {
    runs.watch = until_stopped([], async (context) => void (await context.resumable()));
    const one = await open_tab();
    await one.background.start("watch");
    await vi.waitFor(async () => expect((await saved(one)).resume.watch).toBeDefined());
    await one.background.stop("watch");
    expect((await saved(one)).resume).toEqual({});
  });
});
