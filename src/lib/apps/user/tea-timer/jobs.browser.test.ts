import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from "vitest";
import kernel, { type IService } from "$lib/core/api";
import { stub_service } from "$lib/core/api/kernel/test-kernel";
import { clear_opfs } from "$lib/core/api/services/files/opfs";
import { LINGER_MS } from "$lib/core/contexts/app/live-file.svelte";
import { FilesService } from "$lib/core/api/services/files/service.svelte";
import { NotificationsService } from "$lib/core/api/services/notifications/service.svelte";
import { SchedulerService } from "$lib/core/api/services/scheduler/service.svelte";
import { start_brew, steep_again, stop_brew, tea_file } from "./jobs";
import { all_teas, brews_of, Strength, type Brew } from "./tea";

const MINUTE = 60_000;
let files: FilesService;
let scheduler: SchedulerService;
let notifications: NotificationsService;
let launch: ReturnType<typeof vi.fn>;
const booted: IService[] = [];

function use(name: string, service: IService): void {
  kernel.services.set(name, service);
  booted.push(service);
}

// Live cells (the teas file) outlast a test, so files stays registered for the whole file.
beforeAll(() => {
  files = new FilesService();
  kernel.services.set("files", files);
});

afterAll(async () => {
  await new Promise((resolve) => setTimeout(resolve, LINGER_MS + 100));
  kernel.services.delete("files");
});

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 25, 16, 0));
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

async function brews(): Promise<Brew[]> {
  const data = await tea_file.read();
  return brews_of(scheduler.jobs, data, all_teas(data));
}

test("two cups brew at once and each rings with no Tea Timer window", async () => {
  const data = await tea_file.read();
  const [black, green] = ["black", "green"].map((id) => all_teas(data).find((tea) => tea.id === id)!);
  const black_job = await start_brew(black, Strength.STRONG);
  const green_job = await start_brew(green, Strength.LIGHT);
  expect(scheduler.next(black_job)).toBe(Date.now() + 5 * MINUTE);
  expect(scheduler.next(green_job)).toBe(Date.now() + 2 * MINUTE);
  expect((await tea_file.read()).strength).toEqual({ black: Strength.STRONG, green: Strength.LIGHT });
  expect((await brews()).map((brew) => brew.ready)).toEqual([false, false]);

  await wake_at(Date.now() + 2 * MINUTE + 1_000);
  await vi.waitFor(() => expect(titles()).toEqual(["Green tea is ready"]));
  const toast = notifications.all[0];
  expect(toast.message).toBe("Steep 1 of 3 · Light · 2 min");
  expect(toast.actions?.map((action) => action.label)).toEqual(["Open"]);
  toast.actions![0].on_click();
  expect(launch).toHaveBeenCalledWith("tea-timer", undefined);
  const [ready, running] = await brews();
  expect(ready).toMatchObject({ job: green_job, ready: true, steep: 1 });
  expect(running).toMatchObject({ job: black_job, ready: false });
});

test("a ready cup brews its next steep longer, then Done clears it", async () => {
  const data = await tea_file.read();
  const green = all_teas(data).find((tea) => tea.id === "green")!;
  const job = await start_brew(green, Strength.MEDIUM);
  await wake_at(Date.now() + 3 * MINUTE);
  await vi.waitFor(() => expect(titles()).toHaveLength(1));

  const [brew] = await brews();
  await steep_again(brew, green, 2);
  expect(scheduler.get(job)).toMatchObject({ armed: true, at: { epoch: Date.now() + 3 * MINUTE }, message: "Steep 2 of 3 · Medium · 3 min" });
  expect((await tea_file.read()).brews[job]).toEqual({ tea: "green", steep: 2, strength: Strength.MEDIUM });

  await wake_at(Date.now() + 3 * MINUTE);
  await vi.waitFor(() => expect(titles()).toHaveLength(2));
  const [again] = await brews();
  expect(again).toMatchObject({ ready: true, steep: 2 });

  await stop_brew(again);
  expect(scheduler.get(job)).toBeUndefined();
  expect((await tea_file.read()).brews).toEqual({});
});
