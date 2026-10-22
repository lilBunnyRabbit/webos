import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { SvelteSet } from "svelte/reactivity";
import type { Kernel } from "$lib/core/api";
import { boot_test_kernel, stub_service } from "../../kernel/test-kernel";
import * as opfs from "../files/opfs";
import { FilesService } from "../files/service.svelte";
import { NotificationsService } from "../notifications/service.svelte";
import { CLICK_MESSAGE, ClickSource, type NotificationClick } from "../notifications/system";
import { parse_registry, SCHEDULER_PATH, serialize_registry, type Registry } from "./persistence";
import { SchedulerService } from "./service.svelte";
import { CHANNEL } from "./store";
import { FireOutcome, JobKind, type Job, type JobInput, type OnFire } from "./type";

const MINUTE = 60_000;
const shutdowns: Array<() => Promise<void>> = [];

interface Tab {
  kernel: Kernel;
  scheduler: SchedulerService;
  notifications: NotificationsService;
  launch: ReturnType<typeof vi.fn>;
  execute: ReturnType<typeof vi.fn>;
  shutdown: () => Promise<void>;
}

const USER_APPS = new Set(["cards", "kanban"]);
const installed = new SvelteSet<string>();
const handlers: Record<string, ReturnType<typeof vi.fn<OnFire>>> = {};

async function open_tab(): Promise<Tab> {
  const launch = vi.fn();
  const execute = vi.fn(async () => ({}));
  const booted = await boot_test_kernel({
    files: FilesService,
    notifications: NotificationsService,
    apps: stub_service("apps", {
      launch,
      get: (id: string) =>
        (USER_APPS.has(id) ? { system: false, on_fire: async () => ({ default: handlers[id] }) } : id === "settings" ? { system: true } : undefined) as never,
      is_installed: (id: string) => !USER_APPS.has(id) || installed.has(id),
    }),
    shell: stub_service("shell", { execute }),
    scheduler: SchedulerService,
  });
  let closed = false;
  const shutdown = async () => {
    if (closed) return;
    closed = true;
    await booted.shutdown();
  };
  shutdowns.push(shutdown);
  return {
    kernel: booted.kernel,
    scheduler: booted.kernel.service<SchedulerService>("scheduler"),
    notifications: booted.kernel.service<NotificationsService>("notifications"),
    launch,
    execute,
    shutdown,
  };
}

async function seed(registry: Registry): Promise<void> {
  const files = new FilesService();
  await files.init();
  let handle = await files.get_root();
  for (const segment of ["var", "lib", "scheduler"]) handle = await handle.getDirectoryHandle(segment, { create: true });
  await opfs.write_file(await handle.getFileHandle("jobs.json", { create: true }), serialize_registry(registry));
}

async function on_disk(tab: Tab): Promise<Registry> {
  const file = await tab.kernel.service<FilesService>("files").get_file(SCHEDULER_PATH);
  return parse_registry(file ? await file.text() : null);
}

const reminder = (key: string, at: number, extra: Partial<JobInput> = {}): JobInput => ({ key, title: `Reminder ${key}`, at: { epoch: at }, kind: JobKind.REMINDER, ...extra });
const titles = (tab: Tab) => tab.notifications.all.map((notification) => notification.title);
interface ChannelMessage {
  type: string;
  count?: number;
}

const real_timeout = window.setTimeout.bind(window);
const sleep = (ms: number) => new Promise((resolve) => real_timeout(resolve, ms));
const reads = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.filter(([path]) => path === SCHEDULER_PATH).length;

function set_visibility(state: DocumentVisibilityState): void {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
}

function listen_channel(): ChannelMessage[] {
  const messages: ChannelMessage[] = [];
  const channel = new BroadcastChannel(CHANNEL);
  channel.onmessage = (event: MessageEvent<ChannelMessage>) => void messages.push(event.data);
  shutdowns.push(async () => channel.close());
  return messages;
}

beforeEach(async () => {
  await opfs.clear_opfs();
  installed.clear();
  for (const id of USER_APPS) installed.add(id);
  for (const id of USER_APPS) handlers[id] = vi.fn<OnFire>();
});

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete (document as { visibilityState?: unknown }).visibilityState;
  for (const shutdown of shutdowns.splice(0).reverse()) await shutdown();
});

describe("registry", () => {
  test("schedule writes jobs.json and a new tab reads it back", async () => {
    const tab = await open_tab();
    const job = await tab.scheduler.schedule("clock", reminder("tea", Date.now() + 10 * MINUTE, { actions: [{ label: "Stop", command: "timer stop tea" }] }));
    expect(job).toMatchObject({ id: "clock:tea", app: "clock", armed: true });
    expect((await on_disk(tab)).jobs).toEqual([job]);

    const other = await open_tab();
    expect(other.scheduler.get("clock:tea")).toEqual(job);
    expect(other.scheduler.list("clock")).toHaveLength(1);
    expect(other.scheduler.list("calendar")).toEqual([]);
  });

  test("another tab sees a change without reloading", async () => {
    const a = await open_tab();
    const b = await open_tab();
    await a.scheduler.schedule("clock", reminder("tea", Date.now() + 10 * MINUTE));
    await vi.waitFor(() => expect(b.scheduler.get("clock:tea")).toBeDefined());
    await b.scheduler.cancel("clock:tea");
    await vi.waitFor(() => expect(a.scheduler.jobs).toEqual([]));
  });

  test("two tabs writing at once keep both changes", async () => {
    const a = await open_tab();
    const b = await open_tab();
    const later = Date.now() + 10 * MINUTE;
    await Promise.all([
      a.scheduler.schedule("clock", reminder("a", later)),
      b.scheduler.schedule("clock", reminder("b", later)),
      a.scheduler.schedule("calendar", reminder("c", later)),
      b.scheduler.schedule("calendar", reminder("d", later)),
    ]);
    expect((await on_disk(a)).jobs.map((job) => job.id).sort()).toEqual(["calendar:c", "calendar:d", "clock:a", "clock:b"]);
  });

  test("schedule replaces a job with the same key in place", async () => {
    const tab = await open_tab();
    await tab.scheduler.schedule("clock", reminder("a", Date.now() + MINUTE));
    await tab.scheduler.schedule("clock", reminder("b", Date.now() + MINUTE));
    await tab.scheduler.schedule("clock", reminder("a", Date.now() + 2 * MINUTE, { title: "Renamed" }));
    expect(tab.scheduler.jobs.map((job) => job.title)).toEqual(["Renamed", "Reminder b"]);
  });

  test("rejects an invalid job without writing", async () => {
    const tab = await open_tab();
    await expect(tab.scheduler.schedule("clock", reminder("x", 0, { actions: [1, 2, 3].map((n) => ({ label: `${n}`, command: "x" })) }))).rejects.toThrow(/actions/);
    await expect(tab.scheduler.schedule("clock", { ...reminder("x", 0), at: { date: "2026-10-21", time: "07:00", tz: "Nowhere/Land" } })).rejects.toThrow(/tz/);
    expect(await tab.kernel.service<FilesService>("files").get_file(SCHEDULER_PATH)).toBeNull();
  });

  test("a repeating job counts from when it was scheduled", async () => {
    const tab = await open_tab();
    const before = Date.now();
    const job = await tab.scheduler.schedule("clock", { key: "wake", title: "Wake", at: { date: "2020-01-01", time: "00:00", tz: "UTC" }, repeat: { every: "day" }, kind: JobKind.ALARM });
    expect(job.armed_at).toBeGreaterThanOrEqual(before);
    expect(job.last_fired).toBeUndefined();
    const next = tab.scheduler.next("clock:wake")!;
    expect(next).toBeGreaterThan(Date.now());
    expect(next - Date.now()).toBeLessThanOrEqual(24 * 60 * MINUTE);
    expect(titles(tab)).toEqual([]);
  });

  test("update merges, clears a field set to undefined and re-times a one-shot", async () => {
    const tab = await open_tab();
    await tab.scheduler.schedule("clock", reminder("a", Date.now() + 10 * MINUTE, { message: "hi", snooze_until: Date.now() + 20 * MINUTE }));
    const updated = await tab.scheduler.update("clock:a", { title: "New", snooze_until: undefined });
    expect(updated).toMatchObject({ title: "New", message: "hi" });
    expect(updated).not.toHaveProperty("snooze_until");
    expect(await tab.scheduler.update("clock:none", { title: "x" })).toBeNull();
    expect(await tab.scheduler.cancel("clock:none")).toBe(false);
  });

  test("a one-shot whose time passed before it was scheduled never fires", async () => {
    const tab = await open_tab();
    await tab.scheduler.schedule("clock", reminder("late", Date.now() - MINUTE));
    expect(tab.scheduler.next("clock:late")).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(titles(tab)).toEqual([]);
    expect(tab.scheduler.get("clock:late")).toMatchObject({ armed: true });
  });

  test("re-timing or switching a job back on arms it from then; the scheduler's own fields can't be patched", async () => {
    const tab = await open_tab();
    const first = await tab.scheduler.schedule("clock", reminder("a", Date.now() + 10 * MINUTE, { armed: false }));
    expect(first.armed_at).toBeUndefined();
    const armed = (await tab.scheduler.update("clock:a", { armed: true }))!;
    expect(armed.armed_at).toBeGreaterThan(0);
    const sneaky = { title: "x", armed_at: 1, last_fired: 2, missed_at: 3 } as unknown as Parameters<SchedulerService["update"]>[1];
    expect(await tab.scheduler.update("clock:a", sneaky)).toMatchObject({ title: "x", armed_at: armed.armed_at });
    expect(tab.scheduler.get("clock:a")).not.toHaveProperty("last_fired");
    expect(tab.scheduler.get("clock:a")).not.toHaveProperty("missed_at");
  });

  test("uninstalling a user app drops its jobs; system and unknown apps keep theirs", async () => {
    const tab = await open_tab();
    const later = Date.now() + 10 * MINUTE;
    await tab.scheduler.schedule("cards", reminder("a", later));
    await tab.scheduler.schedule("kanban", reminder("b", later));
    await tab.scheduler.schedule("settings", reminder("c", later));
    await tab.scheduler.schedule("clock", reminder("d", later));
    installed.delete("cards");
    await vi.waitFor(() => expect(tab.scheduler.jobs.map((job) => job.id)).toEqual(["kanban:b", "settings:c", "clock:d"]));
    expect((await on_disk(tab)).jobs.map((job) => job.id)).toEqual(["kanban:b", "settings:c", "clock:d"]);
  });
});

describe("leader", () => {
  test("one tab leads; a newer visible tab takes over, and the first leads again once it closes", async () => {
    const a = await open_tab();
    await vi.waitFor(() => expect(a.scheduler.is_leader).toBe(true));
    const b = await open_tab();
    await vi.waitFor(() => expect(b.scheduler.is_leader).toBe(true));
    expect(a.scheduler.is_leader).toBe(false);

    await b.shutdown();
    await vi.waitFor(() => expect(a.scheduler.is_leader).toBe(true));
  });

  test("only the leader fires, once", async () => {
    const a = await open_tab();
    const b = await open_tab();
    await vi.waitFor(() => expect(b.scheduler.is_leader).toBe(true));
    await a.scheduler.schedule("clock", reminder("tea", Date.now() + 150));

    await vi.waitFor(() => expect(a.scheduler.get("clock:tea")?.armed).toBe(false));
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(titles(b)).toEqual(["Reminder tea"]);
    expect(titles(a)).toEqual([]);
  });
});

describe("firing", () => {
  test("fires a due job on time with a toast that runs its commands", async () => {
    const tab = await open_tab();
    const at = Date.now() + 200;
    await tab.scheduler.schedule("clock", reminder("tea", at, { actions: [{ label: "Restart", command: "timer restart tea" }], open: { app: "clock", props: { tab: "timers" } } }));

    await vi.waitFor(() => expect(tab.scheduler.get("clock:tea")).toMatchObject({ armed: false, last_fired: at }));
    const toast = tab.notifications.all.find((notification) => notification.title === "Reminder tea")!;
    expect(toast.actions?.map((action) => action.label)).toEqual(["Restart", "Open"]);
    toast.actions![0].on_click();
    expect(tab.execute).toHaveBeenCalledWith("timer restart tea");
    toast.actions![1].on_click();
    expect(tab.launch).toHaveBeenCalledWith("clock", { tab: "timers" });
    expect(tab.scheduler.next("clock:tea")).toBeNull();
  });

  test("a wake after the clock moved fires what's within the grace and notes the jump", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const tab = await open_tab();
    await vi.waitFor(() => expect(tab.scheduler.is_leader).toBe(true));
    const at = Date.now() + 10 * MINUTE;
    await tab.scheduler.schedule("clock", reminder("tea", at));
    await sleep(200);

    vi.setSystemTime(at + 30_000);
    window.dispatchEvent(new Event("focus"));
    await vi.waitFor(() => expect(tab.scheduler.get("clock:tea")?.last_fired).toBe(at));
    expect(titles(tab)).toEqual(["Reminder tea"]);
    expect(tab.scheduler.last_jump).not.toBeNull();
  });

  test("a wake long after the time reports it missed and disarms it", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const tab = await open_tab();
    await vi.waitFor(() => expect(tab.scheduler.is_leader).toBe(true));
    const at = Date.now() + 10 * MINUTE;
    await tab.scheduler.schedule("clock", reminder("tea", at));

    vi.setSystemTime(at + 60 * MINUTE);
    document.dispatchEvent(new Event("resume"));
    await vi.waitFor(() => expect(tab.scheduler.get("clock:tea")?.armed).toBe(false));
    expect(titles(tab)).toEqual(["1 missed while WebOS was asleep", "Reminder tea"]);
    expect(tab.scheduler.get("clock:tea")).toMatchObject({ missed_at: at });
    expect(tab.scheduler.get("clock:tea")).not.toHaveProperty("last_fired");
    expect(await tab.scheduler.update("clock:tea", { missed_at: undefined })).not.toHaveProperty("missed_at");
    expect(tab.notifications.toasts.map((toast) => toast.title)).toEqual(["1 missed while WebOS was asleep"]);
    expect(tab.scheduler.missed).toEqual([{ id: "clock:tea", app: "clock", title: "Reminder tea", kind: JobKind.REMINDER, due: at }]);
  });

  test("at boot, a job due long ago is missed while closed; a repeating one skips ahead", async () => {
    const now = Date.now();
    const daily: Job = { id: "clock:wake", app: "clock", title: "Wake", at: { date: "2020-01-01", time: "06:00", tz: "UTC" }, repeat: { every: "day" }, armed: true, last_fired: now - 3 * 24 * 60 * MINUTE, kind: JobKind.ALARM };
    const old: Job = { id: "pomodoro:phase", app: "pomodoro", title: "Focus done", at: { epoch: now - 2 * 60 * MINUTE }, armed: true, kind: JobKind.PHASE };
    await seed({ version: 1, jobs: [daily, old] });

    const tab = await open_tab();
    await vi.waitFor(() => expect(titles(tab)[0]).toBe("2 missed while WebOS was closed"));
    expect(tab.scheduler.get("pomodoro:phase")?.armed).toBe(false);
    expect(tab.scheduler.get("clock:wake")?.armed).toBe(true);
    expect(tab.scheduler.next("clock:wake")).toBeGreaterThan(Date.now());
    expect(tab.scheduler.missed.map((job) => job.id).sort()).toEqual(["clock:wake", "pomodoro:phase"]);
    expect(tab.scheduler.get("pomodoro:phase")?.missed_at).toBe(now - 2 * 60 * MINUTE);

    const before = tab.scheduler.next("clock:wake");
    await tab.scheduler.update("clock:wake", { missed_at: undefined });
    expect(tab.scheduler.next("clock:wake")).toBe(before);
  });

  test("the app's on-fire handler runs after the notification, with the job as fired", async () => {
    const tab = await open_tab();
    const seen: string[][] = [];
    handlers.kanban.mockImplementation(() => void seen.push(titles(tab)));
    const at = Date.now() + 150;
    await tab.scheduler.schedule("kanban", reminder("due", at));

    await vi.waitFor(() => expect(handlers.kanban).toHaveBeenCalledOnce());
    const [job, fire] = handlers.kanban.mock.calls[0];
    expect(fire).toEqual({ outcome: FireOutcome.FIRED, due: at });
    expect(job).toMatchObject({ id: "kanban:due", armed: false, last_fired: at });
    expect(seen).toEqual([["Reminder due"]]);
  });

  test("a missed job reaches the handler as missed; a handler that throws is reported and the next still runs", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const tab = await open_tab();
    await vi.waitFor(() => expect(tab.scheduler.is_leader).toBe(true));
    vi.spyOn(console, "error").mockImplementation(() => {});
    handlers.cards.mockRejectedValue(new Error("board gone"));
    const at = Date.now() + 10 * MINUTE;
    await tab.scheduler.schedule("cards", reminder("a", at));
    await tab.scheduler.schedule("kanban", reminder("b", at));

    vi.setSystemTime(at + 60 * MINUTE);
    document.dispatchEvent(new Event("resume"));
    await vi.waitFor(() => expect(handlers.kanban).toHaveBeenCalledOnce());
    expect(handlers.kanban.mock.calls[0][0]).toMatchObject({ id: "kanban:b", missed_at: at });
    expect(handlers.kanban.mock.calls[0][1]).toEqual({ outcome: FireOutcome.MISSED, due: at });
    expect(tab.notifications.all.find((entry) => entry.title === "Couldn't finish “Reminder a”")?.message).toBe("board gone");
    expect(tab.scheduler.is_leader).toBe(true);
  });

  test("an app without a handler, or a follower tab, runs none", async () => {
    const a = await open_tab();
    const b = await open_tab();
    await vi.waitFor(() => expect(b.scheduler.is_leader).toBe(true));
    await a.scheduler.schedule("clock", reminder("tea", Date.now() + 100));
    await a.scheduler.schedule("kanban", reminder("due", Date.now() + 100));
    await vi.waitFor(() => expect(a.scheduler.get("kanban:due")?.armed).toBe(false));
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(handlers.kanban).toHaveBeenCalledOnce();
  });

  test("a snooze fires once, then the rule carries on", async () => {
    const tab = await open_tab();
    await tab.scheduler.schedule("clock", { key: "wake", title: "Wake", at: { date: "2020-01-01", time: "06:00", tz: "UTC" }, repeat: { every: "day" }, kind: JobKind.ALARM });
    const snooze = Date.now() + 200;
    await tab.scheduler.update("clock:wake", { snooze_until: snooze });
    await vi.waitFor(() => expect(tab.scheduler.get("clock:wake")?.snooze_until).toBeUndefined());
    expect(titles(tab)).toEqual(["Wake"]);
    expect(tab.scheduler.get("clock:wake")).toMatchObject({ armed: true, last_fired: snooze });
  });
});

describe("idle", () => {
  test("boot reads the registry once before the first pass", async () => {
    const read = vi.spyOn(FilesService.prototype, "get_file");
    const tab = await open_tab();
    await vi.waitFor(() => expect(tab.scheduler.is_leader).toBe(true));
    await sleep(200);
    expect(reads(read)).toBe(2);
  });

  test("with no jobs the leader keeps no timer, and a focus or becoming visible reads nothing", async () => {
    const tab = await open_tab();
    await vi.waitFor(() => expect(tab.scheduler.is_leader).toBe(true));
    const timeouts = vi.spyOn(window, "setTimeout");
    await tab.scheduler.schedule("clock", reminder("tea", Date.now() + 10 * MINUTE));
    await vi.waitFor(() => expect(timeouts).toHaveBeenCalled());
    await tab.scheduler.cancel("clock:tea");
    await sleep(200);
    timeouts.mockClear();

    const read = vi.spyOn(tab.kernel.service<FilesService>("files"), "get_file");
    window.dispatchEvent(new Event("focus"));
    set_visibility("visible");
    await sleep(200);
    expect(reads(read)).toBe(0);
    expect(timeouts).not.toHaveBeenCalled();
    expect(tab.scheduler.is_leader).toBe(true);
  });

  test("with only switched-off jobs the leader keeps no timer; switching one on arms it", async () => {
    const tab = await open_tab();
    await vi.waitFor(() => expect(tab.scheduler.is_leader).toBe(true));
    await tab.scheduler.schedule("clock", reminder("tea", Date.now() + 10 * MINUTE));
    await sleep(200);
    const timeouts = vi.spyOn(window, "setTimeout");
    const armed = () => timeouts.mock.calls.filter(([, delay]) => (delay ?? 0) > 1_000).length;
    await tab.scheduler.update("clock:tea", { armed: false });
    await sleep(200);
    expect(armed()).toBe(0);

    await tab.scheduler.update("clock:tea", { armed: true });
    await vi.waitFor(() => expect(armed()).toBe(1));
  });

  test("the idle wake-up lands on the minute; a job due sooner sets the time", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const tab = await open_tab();
    await vi.waitFor(() => expect(tab.scheduler.is_leader).toBe(true));
    vi.setSystemTime(new Date("2026-10-21T10:00:20.000Z"));
    const timeouts = vi.spyOn(window, "setTimeout");

    await tab.scheduler.schedule("clock", reminder("later", Date.now() + 60 * MINUTE));
    await sleep(200);
    expect(timeouts).toHaveBeenLastCalledWith(expect.any(Function), 40_000);
    await tab.scheduler.schedule("clock", reminder("soon", Date.now() + 50_000));
    await sleep(200);
    expect(timeouts).toHaveBeenLastCalledWith(expect.any(Function), 50_000);
  });

  test("becoming visible steals the lead once; going hidden runs no pass", async () => {
    const a = await open_tab();
    await vi.waitFor(() => expect(a.scheduler.is_leader).toBe(true));
    await a.scheduler.schedule("clock", reminder("tea", Date.now() + 10 * MINUTE));
    const b = await open_tab();
    await vi.waitFor(() => expect(b.scheduler.is_leader).toBe(true));
    await sleep(200);

    const read = vi.spyOn(a.kernel.service<FilesService>("files"), "get_file");
    set_visibility("hidden");
    await sleep(200);
    expect(reads(read)).toBe(0);

    const requests = vi.spyOn(navigator.locks, "request");
    set_visibility("visible");
    window.dispatchEvent(new Event("focus"));
    await vi.waitFor(() => expect(a.scheduler.is_leader || b.scheduler.is_leader).toBe(true));
    await sleep(200);
    const steals = requests.mock.calls.filter(([, options]) => typeof options === "object" && (options as LockOptions).steal);
    expect(steals).toHaveLength(1);
  });

  test("becoming visible clears the badge only when one was set", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const tab = await open_tab();
    await vi.waitFor(() => expect(tab.scheduler.is_leader).toBe(true));
    const messages = listen_channel();
    set_visibility("visible");
    await sleep(200);
    expect(messages).toEqual([]);

    const at = Date.now() + 10 * MINUTE;
    await tab.scheduler.schedule("clock", reminder("tea", at));
    await vi.waitFor(() => expect(messages).toContainEqual({ type: "changed" }));
    set_visibility("hidden");
    vi.setSystemTime(at + 60 * MINUTE);
    document.dispatchEvent(new Event("resume"));
    await vi.waitFor(() => expect(messages).toContainEqual({ type: "badge", count: 1 }));

    set_visibility("visible");
    await vi.waitFor(() => expect(messages).toContainEqual({ type: "seen" }));
  });
});

describe("notification clicks", () => {
  async function click(message: Partial<NotificationClick>): Promise<boolean> {
    const channel = new MessageChannel();
    const answer = new Promise<boolean>((resolve) => (channel.port1.onmessage = (event) => resolve(event.data.claimed)));
    const data: NotificationClick = { type: CLICK_MESSAGE, source: ClickSource.SCHEDULER, id: "clock:tea", action: null, command: null, route: null, ...message };
    navigator.serviceWorker.dispatchEvent(new MessageEvent("message", { data, ports: [channel.port2] }));
    return answer;
  }

  test("a full tab takes a button click and runs its command", async () => {
    const tab = await open_tab();
    expect(await click({ action: 0, command: "alarm stop tea" })).toBe(true);
    expect(tab.execute).toHaveBeenCalledWith("alarm stop tea");
  });

  test("a body click opens the route with its props", async () => {
    const tab = await open_tab();
    expect(await click({ route: "#/app/clock?tab=timers" })).toBe(true);
    expect(tab.launch).toHaveBeenCalledWith("clock", { tab: "timers" });
  });

  test("a system notification's click goes back to the tab that sent it", async () => {
    const tab = await open_tab();
    const on_click = vi.fn();
    const id = tab.notifications.notify("example", { title: "Done", actions: [{ label: "Show", on_click }] });
    expect(await click({ source: ClickSource.NOTIFICATIONS, id, action: 0 })).toBe(true);
    expect(on_click).toHaveBeenCalledOnce();
    expect(tab.notifications.all[0].read).toBe(true);
    expect(await click({ source: ClickSource.NOTIFICATIONS, id: "someone-else" })).toBe(false);
  });
});
