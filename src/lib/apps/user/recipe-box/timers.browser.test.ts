import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from "vitest";
import kernel, { type IService } from "$lib/core/api";
import { stub_service } from "$lib/core/api/kernel/test-kernel";
import { clear_opfs } from "$lib/core/api/services/files/opfs";
import { FilesService } from "$lib/core/api/services/files/service.svelte";
import { NotificationsService } from "$lib/core/api/services/notifications/service.svelte";
import { SchedulerService } from "$lib/core/api/services/scheduler/service.svelte";
import type { CommandContext } from "$lib/core/api/services/shell/type";
import { APP_ID } from "./constants";
import { timer_stop } from "./shell";
import { cook_timers } from "./timers";
import { start_cook_timer } from "./timers.svelte";

let files: FilesService;
let scheduler: SchedulerService;
let notifications: NotificationsService;
let launch: ReturnType<typeof vi.fn>;
const booted: IService[] = [];

function use(name: string, service: IService): void {
  kernel.services.set(name, service);
  booted.push(service);
}

beforeAll(() => {
  files = new FilesService();
  kernel.services.set("files", files);
});

afterAll(() => kernel.services.delete("files"));

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  await clear_opfs();
  await files.init();
  launch = vi.fn();
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

test("a cook timer rings after its window closed, and its Stop command clears it", async () => {
  // Started the way cook mode does, then nothing of Recipe Box stays mounted.
  await start_cook_timer("Simmer", 10 * 60_000, { title: "Tomato soup", path: "/home/Recipes/soup.cook" });
  const [timer] = cook_timers(scheduler.list(APP_ID));
  expect(timer).toMatchObject({ label: "Simmer", done: false, path: "/home/Recipes/soup.cook" });

  vi.setSystemTime(timer.end_at + 1_000);
  window.dispatchEvent(new Event("focus"));
  await vi.waitFor(() => expect(notifications.all.map((notification) => notification.title)).toEqual(["Simmer"]));
  const toast = notifications.all[0];
  expect(toast.message).toBe("Time's up · Tomato soup");
  expect(toast.actions?.map((action) => action.label)).toEqual(["Stop", "Open"]);
  toast.actions![1].on_click();
  expect(launch).toHaveBeenCalledWith(APP_ID, { path: "/home/Recipes/soup.cook" });
  expect(cook_timers(scheduler.list(APP_ID))).toMatchObject([{ id: timer.id, done: true }]);

  const context = { args: { timer: timer.key } } as unknown as CommandContext<{ timer: string }>;
  expect(await timer_stop(context)).toBe("cleared Simmer");
  expect(scheduler.list(APP_ID)).toEqual([]);
  await expect(timer_stop(context)).rejects.toThrow(/no cook timer/);
});
