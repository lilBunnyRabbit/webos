import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from "vitest";
import kernel, { type IService } from "$lib/core/api";
import { stub_service } from "$lib/core/api/kernel/test-kernel";
import { clear_opfs } from "$lib/core/api/services/files/opfs";
import { LINGER_MS } from "$lib/core/contexts/app/live-file.svelte";
import { FilesService } from "$lib/core/api/services/files/service.svelte";
import { NotificationsService } from "$lib/core/api/services/notifications/service.svelte";
import { SchedulerService } from "$lib/core/api/services/scheduler/service.svelte";
import type { CommandContext, Tagged } from "$lib/core/api/services/shell/type";
import { alarm_job_id, timer_job_id } from "./clock";
import { clock_file } from "./jobs";
import { alarm_add, alarm_snooze, alarm_stop, timer_restart, timer_start, timer_stop, timers } from "./shell";

const MINUTE = 60_000;
let files: FilesService;
let scheduler: SchedulerService;
let notifications: NotificationsService;
let launch: ReturnType<typeof vi.fn>;
const booted: IService[] = [];

function context<T>(args: T): CommandContext<T> {
  return { args, input: (async function* () {})(), piped: false, session: { cwd: "/home" }, signal: new AbortController().signal, elevated: false } as unknown as CommandContext<T>;
}

function use(name: string, service: IService): void {
  kernel.services.set(name, service);
  booted.push(service);
}

// Live cells (the Clock data file) outlast a test, so files stays registered for the whole file.
beforeAll(() => {
  files = new FilesService();
  kernel.services.set("files", files);
});

afterAll(async () => {
  await new Promise((resolve) => setTimeout(resolve, LINGER_MS + 100));
  kernel.services.delete("files");
});

// No Clock window or widget anywhere: only the services a tab boots with.
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 16, 12, 0));
  await clear_opfs();
  launch = vi.fn();
  await files.init();
  notifications = new NotificationsService();
  use("notifications", notifications);
  use("apps", stub_service("apps", { launch, get: () => undefined, is_installed: () => true }));
  use("shell", stub_service("shell", { execute: vi.fn() }));
  scheduler = new SchedulerService(kernel);
  await scheduler.init();
  use("scheduler", scheduler);
  await vi.waitFor(() => expect(scheduler.is_leader).toBe(true));
});

afterEach(async () => {
  for (const service of booted.splice(0).reverse()) await service.destroy?.();
  for (const name of ["notifications", "apps", "shell", "scheduler"]) kernel.services.delete(name);
  vi.useRealTimers();
});

const titles = () => notifications.all.map((notification) => notification.title);

async function wake_at(at: number): Promise<void> {
  vi.setSystemTime(at);
  window.dispatchEvent(new Event("focus"));
}

test("alarm add from the shell rings with no Clock window open", async () => {
  const alarm = await alarm_add(context({ time: "18:30", label: ["Dinner"] }));
  const id = alarm_job_id(String(alarm.id));
  const due = new Date(2026, 9, 16, 18, 30).getTime();
  expect(scheduler.next(id)).toBe(due);
  expect((await clock_file.read()).alarms[id]).toEqual({ label: "Dinner" });

  await wake_at(due + 20_000);
  await vi.waitFor(() => expect(titles()).toEqual(["Dinner"]));
  expect(scheduler.get(id)).toMatchObject({ armed: false, last_fired: due });
  const toast = notifications.all[0];
  expect(toast.message).toBe("18:30 · Once");
  expect(toast.actions?.map((action) => action.label)).toEqual(["Snooze 10 min", "Stop", "Open"]);
  toast.actions![2].on_click();
  expect(launch).toHaveBeenCalledWith("clock", { tab: "alarms" });
});

test("a snooze from the command rings again, and alarm stop drops one", async () => {
  const alarm = await alarm_add(context({ time: "18:30", label: [] }));
  const id = alarm_job_id(String(alarm.id));
  const due = new Date(2026, 9, 16, 18, 30).getTime();
  await wake_at(due);
  await vi.waitFor(() => expect(titles()).toEqual(["Alarm"]));

  const snoozed = await alarm_snooze(context({ alarm: String(alarm.id), duration: "10m" }));
  expect(snoozed).toMatchObject({ on: true, next: expect.stringMatching(/^snoozed, 18:40/) });
  const snooze = scheduler.get(id)!.snooze_until!;
  expect(Math.abs(snooze - Date.now() - 10 * MINUTE)).toBeLessThan(1000);
  await wake_at(snooze + 5_000);
  await vi.waitFor(() => expect(titles()).toEqual(["Alarm", "Alarm"]));
  expect(scheduler.get(id)).toMatchObject({ armed: false, last_fired: snooze });

  await alarm_snooze(context({ alarm: String(alarm.id), duration: "5m" }));
  expect(await alarm_stop(context({ alarm: String(alarm.id) }))).toMatchObject({ on: false, next: "" });
  expect(scheduler.get(id)).not.toHaveProperty("snooze_until");
  await wake_at(due + 30 * MINUTE);
  await new Promise((resolve) => setTimeout(resolve, 200));
  expect(titles()).toHaveLength(2);
});

test("a weekday alarm set on Friday rings Monday, then Tuesday", async () => {
  const alarm = await alarm_add(context({ time: "07:00", days: "weekdays", label: ["Work"] }));
  const id = alarm_job_id(String(alarm.id));
  const monday = new Date(2026, 9, 19, 7, 0).getTime();
  expect(alarm).toMatchObject({ repeat: "Weekdays", on: true });
  expect(scheduler.next(id)).toBe(monday);

  await wake_at(monday + 1_000);
  await vi.waitFor(() => expect(titles()).toEqual(["Work"]));
  expect(scheduler.get(id)?.armed).toBe(true);
  expect(scheduler.next(id)).toBe(new Date(2026, 9, 20, 7, 0).getTime());
});

test("a timer rings, restarts from its button command and stops", async () => {
  const started = await timer_start(context({ duration: "1m", label: ["tea"] }));
  const id = timer_job_id(String(started.id));
  const end = Date.now() + MINUTE;
  expect(started).toMatchObject({ label: "tea", state: "running" });

  await wake_at(end + 1_000);
  await vi.waitFor(() => expect(titles()).toEqual(["tea is done"]));
  expect(notifications.all[0].actions?.map((action) => action.label)).toEqual(["Restart", "Stop", "Open"]);
  const list = async () => {
    const out: Tagged[] = [];
    for await (const value of timers()) out.push(value);
    return out;
  };
  expect(await list()).toMatchObject([{ label: "tea", state: "done" }]);

  expect(await timer_restart(context({ timer: "tea" }))).toMatchObject({ state: "running", left: "1:00" });
  expect(scheduler.get(id)).toMatchObject({ armed: true, at: { epoch: Date.now() + MINUTE } });
  await wake_at(Date.now() + MINUTE);
  await vi.waitFor(() => expect(titles()).toEqual(["tea is done", "tea is done"]));

  expect(await timer_stop(context({ timer: String(started.id) }))).toBe("stopped tea");
  expect(scheduler.get(id)).toBeUndefined();
  expect((await clock_file.read()).timers).toEqual({});
});
