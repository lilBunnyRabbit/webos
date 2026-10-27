import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from "vitest";
import kernel, { type IService } from "$lib/core/api";
import { stub_service } from "$lib/core/api/kernel/test-kernel";
import { clear_opfs, write_file } from "$lib/core/api/services/files/opfs";
import { FilesService } from "$lib/core/api/services/files/service.svelte";
import { NotificationsService } from "$lib/core/api/services/notifications/service.svelte";
import { SchedulerService } from "$lib/core/api/services/scheduler/service.svelte";
import type { CommandContext } from "$lib/core/api/services/shell/type";
import manifest from "./index";
import * as logic from "./pomodoro";
import { APP_ID, DEFAULT_SETTINGS, IDLE_RUN, JOB_ID, Phase, Status } from "./pomodoro";
import { skip, start, status } from "./shell.svelte";
import { acquire_timer } from "./timer.svelte";

const MINUTE = 60_000;
let files: FilesService;
let scheduler: SchedulerService;
let notifications: NotificationsService;
let execute: ReturnType<typeof vi.fn>;
let achieve: ReturnType<typeof vi.fn>;
let progress: ReturnType<typeof vi.fn>;
const booted: IService[] = [];

function context<T>(args: T): CommandContext<T> {
  return { args, input: (async function* () {})(), piped: false, session: { cwd: "/home" }, signal: new AbortController().signal, elevated: false } as unknown as CommandContext<T>;
}

function use(name: string, service: IService): void {
  kernel.services.set(name, service);
  booted.push(service);
}

beforeAll(() => {
  files = new FilesService();
  kernel.services.set("files", files);
});

afterAll(() => {
  kernel.services.delete("files");
});

// No Pomodoro window or widget: only the services a tab boots with, and whatever the shell commands load.
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 16, 12, 0));
  await clear_opfs();
  execute = vi.fn();
  achieve = vi.fn();
  progress = vi.fn();
  await files.init();
  notifications = new NotificationsService();
  use("notifications", notifications);
  use("apps", stub_service("apps", { launch: vi.fn(), get: (id: string) => (id === APP_ID ? manifest : undefined), is_installed: () => true }));
  use("shell", stub_service("shell", { execute }));
  use("achievements", stub_service("achievements", { achieve, progress }));
  scheduler = new SchedulerService(kernel);
  await scheduler.init();
  use("scheduler", scheduler);
  await vi.waitFor(() => expect(scheduler.is_leader).toBe(true));
});

// Back to idle, so the page-level timer lets go of its files before the next test clears them.
afterEach(async () => {
  const { timer, release } = acquire_timer();
  await vi.waitFor(() => expect(timer.ready).toBe(true));
  await timer.reset();
  timer.file.value.settings.auto_breaks = false;
  release();
  await new Promise((resolve) => setTimeout(resolve, 400));
  for (const service of booted.splice(0).reverse()) await service.destroy?.();
  for (const name of ["notifications", "apps", "shell", "scheduler"]) kernel.services.delete(name);
  vi.useRealTimers();
});

const titles = () => notifications.all.map((notification) => notification.title);

async function wake_at(at: number): Promise<void> {
  vi.setSystemTime(at);
  window.dispatchEvent(new Event("focus"));
}

const TIMER_PATH = "/var/lib/apps/pomodoro/timer.json";
const STATS_PATH = "/var/lib/apps/pomodoro/stats.json";

async function write_json(path: string, value: unknown): Promise<void> {
  const segments = path.split("/").filter(Boolean);
  let handle = await files.get_root();
  for (const segment of segments.slice(0, -1)) handle = await handle.getDirectoryHandle(segment, { create: true });
  await write_file(await handle.getFileHandle(segments.at(-1)!, { create: true }), JSON.stringify(value));
}

async function read_json(path: string) {
  const file = await files.get_file(path);
  return file ? JSON.parse(await file.text()) : null;
}

async function stats() {
  const { timer, release } = acquire_timer();
  try {
    await vi.waitFor(() => expect(timer.ready).toBe(true));
    return JSON.parse(JSON.stringify(timer.stats.value)) as typeof timer.stats.value;
  } finally {
    release();
  }
}

test("a phase started from the shell rings with no window, and its end is counted", async () => {
  const started = Date.now();
  expect(await start(context({ task: ["Report"] }))).toBe("Focus · 25:00 left · ends 12:25 · Report");
  const end = started + 25 * MINUTE;
  expect(scheduler.get(JOB_ID)).toMatchObject({ kind: "phase", armed: true, at: { epoch: end }, title: "Focus done: Report" });

  await wake_at(end + 1_000);
  await vi.waitFor(() => expect(titles()).toEqual(["Focus done: Report"]));
  const toast = notifications.all[0];
  expect(toast.message).toBe("Time for a short break.");
  expect(toast.actions?.map((action) => action.label)).toEqual(["Start break", "Skip", "Open"]);
  toast.actions![0].on_click();
  expect(execute).toHaveBeenCalledWith("pomo start");

  await vi.waitFor(() => expect(scheduler.get(JOB_ID)).toBeUndefined());
  expect((await stats()).days["2026-10-16"]).toEqual({ sessions: 1, ms: 25 * MINUTE });
  expect(await status()).toBe("Short break · ready · 5:00 · Report");
  expect(achieve).toHaveBeenCalledWith(APP_ID, "first-focus");
  expect(achieve).not.toHaveBeenCalledWith(APP_ID, "full-set");
  expect(progress).toHaveBeenCalledWith(APP_ID, "sessions-100", 1);
  expect(progress).toHaveBeenCalledWith(APP_ID, "streak-7", 1);
});

test("skip from the notification's command moves past the break", async () => {
  await start(context({ task: [] }));
  await wake_at(Date.now() + 25 * MINUTE);
  await vi.waitFor(() => expect(titles()).toEqual(["Focus done"]));

  expect(await skip()).toBe("Focus · ready · 25:00");
  expect(scheduler.get(JOB_ID)).toBeUndefined();
  expect((await stats()).days["2026-10-16"].sessions).toBe(1);
});

test("an auto-started break follows with no window and rings too", async () => {
  const { timer, release } = acquire_timer();
  await vi.waitFor(() => expect(timer.ready).toBe(true));
  timer.file.value.settings.auto_breaks = true;
  release();

  await start(context({ task: [] }));
  const focus_end = Date.now() + 25 * MINUTE;
  expect(scheduler.get(JOB_ID)?.message).toBe("Short break started, 5 min.");

  await wake_at(focus_end + 2_000);
  await vi.waitFor(() => expect(titles()).toEqual(["Focus done"]));
  await vi.waitFor(() => expect(scheduler.get(JOB_ID)).toMatchObject({ armed: true, at: { epoch: focus_end + 5 * MINUTE }, title: "Break over" }));

  await wake_at(focus_end + 5 * MINUTE);
  await vi.waitFor(() => expect(titles()).toEqual(["Break over", "Focus done"]));
  await vi.waitFor(() => expect(scheduler.get(JOB_ID)).toBeUndefined());
  expect(await status()).toBe("Focus · ready · 25:00");
});

test("a phase missed while WebOS was closed pauses the next one and says when it ended", async () => {
  await start(context({ task: [] }));
  const end = Date.now() + 25 * MINUTE;

  await wake_at(end + 30 * MINUTE);
  await vi.waitFor(() => expect(scheduler.missed.map((job) => job.id)).toEqual([JOB_ID]));
  await vi.waitFor(() => expect(scheduler.get(JOB_ID)?.missed_at).toBeUndefined());
  expect(scheduler.get(JOB_ID)).toMatchObject({ armed: false });
  expect(notifications.all.find((entry) => entry.title === "Focus done")?.message).toMatch(/^Missed · due /);

  const { timer, release } = acquire_timer();
  try {
    await vi.waitFor(() => expect(timer.ready).toBe(true));
    expect(timer.run).toMatchObject({ phase: Phase.SHORT, status: Status.PAUSED, left: 5 * MINUTE });
    expect(timer.ended).toEqual({ phase: Phase.FOCUS, at: end });
  } finally {
    release();
  }
  expect(await status()).toBe("Focus ended at 12:25 · Short break · paused · 5:00 left");
  expect((await stats()).days["2026-10-16"]).toEqual({ sessions: 1, ms: 25 * MINUTE });

  expect(await start(context({ task: [] }))).toMatch(/^Short break · 5:00 left/);
  expect(scheduler.get(JOB_ID)).toMatchObject({ armed: true, title: "Break over" });
});

test("with Pomodoro loaded nowhere, an ended focus is counted and the auto-started break rings its end", async () => {
  const settings = { ...DEFAULT_SETTINGS, auto_breaks: true };
  const run = logic.start(IDLE_RUN, settings, Date.now());
  const end = run.ends_at!;
  await write_json(TIMER_PATH, { version: 1, settings, plan: logic.plan_of(run, null), ended: null, task: "" });
  await scheduler.schedule(APP_ID, logic.phase_input(run, settings, ""));

  await wake_at(end + 1_000);
  await vi.waitFor(() => expect(scheduler.get(JOB_ID)).toMatchObject({ armed: true, at: { epoch: end + 5 * MINUTE }, title: "Break over" }));
  await vi.waitFor(async () => expect((await read_json(STATS_PATH))?.days["2026-10-16"]).toEqual({ sessions: 1, ms: 25 * MINUTE }));
  await vi.waitFor(async () => expect((await read_json(TIMER_PATH)).plan).toMatchObject({ phase: Phase.SHORT, round: 1, settled: end }));

  await wake_at(end + 5 * MINUTE);
  await vi.waitFor(() => expect(titles()).toEqual(["Break over", "Focus done"]));
  await vi.waitFor(() => expect(scheduler.get(JOB_ID)).toBeUndefined());
  await vi.waitFor(async () => expect((await read_json(TIMER_PATH)).plan).toMatchObject({ phase: Phase.FOCUS, left: null, settled: end + 5 * MINUTE }));
  expect((await read_json(STATS_PATH)).days["2026-10-16"].sessions).toBe(1);
});

test("an open window and the on-fire handler count one end once", async () => {
  const { timer, release } = acquire_timer();
  try {
    await vi.waitFor(() => expect(timer.ready).toBe(true));
    await timer.start(false);
    const end = Date.now() + 25 * MINUTE;

    await wake_at(end + 1_000);
    await vi.waitFor(() => expect(timer.run).toMatchObject({ phase: Phase.SHORT, status: Status.IDLE }));
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(timer.stats.value.days["2026-10-16"]).toEqual({ sessions: 1, ms: 25 * MINUTE });
    expect(timer.file.value.plan.settled).toBe(end);
  } finally {
    release();
  }
});

test("a phase job is silent unless Sound is on, and switching it follows a running phase", async () => {
  const { timer, release } = acquire_timer();
  try {
    await vi.waitFor(() => expect(timer.ready).toBe(true));
    await timer.start(false);
    expect(scheduler.get(JOB_ID)?.silent).toBe(true);
    timer.file.value.settings.sound = true;
    await vi.waitFor(() => expect(scheduler.get(JOB_ID)?.silent).toBe(false), { timeout: 3_000 });
  } finally {
    timer.file.value.settings.sound = false;
    release();
  }
});
