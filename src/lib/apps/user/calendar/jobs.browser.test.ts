import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from "vitest";
import kernel, { type IService } from "$lib/core/api";
import { stub_service } from "$lib/core/api/kernel/test-kernel";
import { clear_opfs } from "$lib/core/api/services/files/opfs";
import { FilesService } from "$lib/core/api/services/files/service.svelte";
import { NotificationsService } from "$lib/core/api/services/notifications/service.svelte";
import { SchedulerService } from "$lib/core/api/services/scheduler/service.svelte";
import type { CommandContext } from "$lib/core/api/services/shell/type";
import { LINGER_MS } from "$lib/core/contexts/app/live-file.svelte";
import { APP_ID, skip_occurrence } from "./calendar";
import manifest from "./index";
import { cancel_reminder, events_file, sync_reminder } from "./jobs";
import type { AddArgs } from "./parse";
import { reminder_job_id } from "./reminders";
import { add } from "./shell";

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

beforeAll(() => {
  files = new FilesService();
  kernel.services.set("files", files);
});

afterAll(async () => {
  await new Promise((resolve) => setTimeout(resolve, LINGER_MS + 100));
  kernel.services.delete("files");
});

// No Calendar window or widget anywhere: only the services a tab boots with, and Calendar's manifest for its handler.
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 16, 12, 0));
  await clear_opfs();
  launch = vi.fn();
  await files.init();
  notifications = new NotificationsService();
  use("notifications", notifications);
  use("apps", stub_service("apps", { launch, get: (id: string) => (id === APP_ID ? manifest : undefined), is_installed: () => true }));
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
const settle = () => new Promise((resolve) => setTimeout(resolve, 200));

async function wake_at(at: number): Promise<void> {
  vi.setSystemTime(at);
  window.dispatchEvent(new Event("focus"));
}

async function cal_add(args: Omit<AddArgs, "title"> & { title: string }): Promise<string> {
  const value = await add(context({ ...args, title: args.title.split(" ") }));
  return String(value.id);
}

test("cal add schedules a reminder that rings with no Calendar window, then lets go of it", async () => {
  const id = reminder_job_id(await cal_add({ title: "Dentist", day: "today", at: "14:30", remind: "15m" }));
  const due = new Date(2026, 9, 16, 14, 15).getTime();
  expect(scheduler.get(id)).toMatchObject({ kind: "reminder", title: "Dentist", open: { app: "calendar", props: { day: "2026-10-16" } } });
  expect(scheduler.next(id)).toBe(due);

  await wake_at(due + 20_000);
  await vi.waitFor(() => expect(titles()).toEqual(["Dentist"]));
  const toast = notifications.all[0];
  expect(toast.message).toBe("14:30–15:30 · in 15 min");
  toast.actions!.at(-1)!.on_click();
  expect(launch).toHaveBeenCalledWith("calendar", { day: "2026-10-16" });
  await vi.waitFor(() => expect(scheduler.get(id)).toBeUndefined());
});

test("a weekly reminder a day ahead rings every week and opens the coming occurrence's day", async () => {
  const id = reminder_job_id(await cal_add({ title: "Gym", day: "2026-10-21", at: "18:00", repeat: "weekly", remind: "1d" }));
  const first = new Date(2026, 9, 20, 18, 0).getTime();
  expect(scheduler.get(id)).toMatchObject({ repeat: { every: "week", days: [2] }, open: { props: { day: "2026-10-21" } } });
  expect(scheduler.next(id)).toBe(first);

  await wake_at(first + 1_000);
  await vi.waitFor(() => expect(titles()).toEqual(["Gym"]));
  expect(notifications.all[0].message).toBe("18:00–19:00 · tomorrow");
  await vi.waitFor(() => expect(scheduler.get(id)?.open?.props).toEqual({ day: "2026-10-28" }));
  expect(scheduler.next(id)).toBe(new Date(2026, 9, 27, 18, 0).getTime());

  await wake_at(new Date(2026, 9, 27, 18, 0, 5).getTime());
  await vi.waitFor(() => expect(titles()).toEqual(["Gym", "Gym"]));
  await vi.waitFor(() => expect(scheduler.get(id)?.open?.props).toEqual({ day: "2026-11-04" }));
});

test("deleting the event cancels its reminder", async () => {
  const event_id = await cal_add({ title: "Call", day: "today", at: "16:00", remind: "10" });
  expect(scheduler.get(reminder_job_id(event_id))).toBeDefined();

  await events_file.edit((data) => ({ ...data, events: data.events.filter((event) => event.id !== event_id) }));
  await cancel_reminder(event_id);
  expect(scheduler.get(reminder_job_id(event_id))).toBeUndefined();
  await wake_at(new Date(2026, 9, 16, 15, 50, 10).getTime());
  await settle();
  expect(titles()).toEqual([]);
});

test("skipping one occurrence leaves its reminder out; a title edit keeps the timing", async () => {
  const event_id = await cal_add({ title: "Walk", day: "today", at: "18:00", repeat: "daily", remind: "30m" });
  const id = reminder_job_id(event_id);
  const event = (await events_file.read()).events.find((entry) => entry.id === event_id)!;
  const skipped = skip_occurrence(event, "2026-10-17");
  await events_file.edit((data) => ({ ...data, events: data.events.map((entry) => (entry.id === event_id ? skipped : entry)) }));
  await sync_reminder(skipped);
  expect(scheduler.get(id)?.repeat).toEqual({ every: "day", skip: ["2026-10-17"] });
  const armed_at = scheduler.get(id)!.armed_at;

  vi.setSystemTime(Date.now() + 1_000);
  await sync_reminder({ ...skipped, title: "Evening walk" });
  expect(scheduler.get(id)).toMatchObject({ title: "Evening walk", armed_at });

  await wake_at(new Date(2026, 9, 16, 17, 30, 5).getTime());
  await vi.waitFor(() => expect(titles()).toEqual(["Evening walk"]));
  await vi.waitFor(() => expect(scheduler.get(id)?.open?.props).toEqual({ day: "2026-10-18" }));

  await wake_at(new Date(2026, 9, 17, 17, 31).getTime());
  await settle();
  expect(titles()).toHaveLength(1);
  expect(scheduler.next(id)).toBe(new Date(2026, 9, 18, 17, 30).getTime());

  await wake_at(new Date(2026, 9, 18, 17, 30, 5).getTime());
  await vi.waitFor(() => expect(titles()).toEqual(["Evening walk", "Evening walk"]));
});

test("removing the reminder from an event cancels its job", async () => {
  const event_id = await cal_add({ title: "Lunch", day: "tomorrow", at: "12:30", remind: "1h" });
  const event = (await events_file.read()).events.find((entry) => entry.id === event_id)!;
  await sync_reminder({ ...event, reminder: null });
  expect(scheduler.get(reminder_job_id(event_id))).toBeUndefined();
});
