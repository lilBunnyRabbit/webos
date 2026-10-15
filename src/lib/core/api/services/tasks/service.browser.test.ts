import { createTask } from "@lilbunnyrabbit/task-manager";
import { describe, expect, test, vi } from "vitest";
import type { Kernel } from "../../kernel/kernel.svelte";
import { NotificationType, type NotificationsService, type NotificationUpdate } from "../notifications/type";
import { TasksService } from "./service.svelte";
import { TaskJobStatus, type TaskContext } from "./type";

function setup() {
  const updates: NotificationUpdate[] = [];
  const notifications = {
    notify: vi.fn(() => "toast"),
    update: (_: string, update: NotificationUpdate) => void updates.push(update),
    dismiss: vi.fn(),
  } as unknown as NotificationsService;
  const kernel = { service: () => notifications } as unknown as Kernel;
  return { tasks: new TasksService(kernel), updates, last: () => updates.at(-1) };
}

const task = <T>(execute: (context: TaskContext) => Promise<T>) => (context: TaskContext) => createTask<void, T>({ name: "work", execute: () => execute(context) })();

const until_aborted = (context: TaskContext) =>
  new Promise<never>((_, reject) => {
    context.signal.throwIfAborted();
    context.signal.addEventListener("abort", () => reject(context.signal.reason), { once: true });
  });

describe("TasksService", () => {
  test("a finished job resolves with the task's result and turns the toast into the done report", async () => {
    const { tasks, last } = setup();
    const job = tasks.run("test", task(async () => 42), { title: "Count", done: (n) => ({ title: `Got ${n}` }) });

    expect(tasks.active_count).toBe(1);
    expect(await job.done).toBe(42);
    expect(job.status).toBe(TaskJobStatus.DONE);
    expect(job.progress).toBe(1);
    expect(tasks.active_count).toBe(0);
    expect(last()).toMatchObject({ type: NotificationType.INFO, title: "Got 42", progress: null });
  });

  test("cancel aborts the work's signal and ends cancelled, not failed", async () => {
    const { tasks, last } = setup();
    const failed = vi.fn(() => ({}));
    const job = tasks.run("test", task(until_aborted), { title: "Wait", failed });

    job.cancel();

    expect(await job.done).toBeNull();
    expect(job.status).toBe(TaskJobStatus.CANCELLED);
    expect(failed).toHaveBeenCalledWith(expect.anything(), true);
    expect(last()).toMatchObject({ type: NotificationType.WARNING, title: "Cancelled" });
  });

  test("the caller's signal cancels too", async () => {
    const { tasks } = setup();
    const controller = new AbortController();
    const job = tasks.run("test", task(until_aborted), { title: "Wait", signal: controller.signal });

    controller.abort();

    expect(await job.done).toBeNull();
    expect(job.status).toBe(TaskJobStatus.CANCELLED);
  });

  test("a failure keeps its message and can be retried under the same id with a fresh task", async () => {
    const { tasks, last } = setup();
    let runs = 0;
    const job = tasks.run(
      "test",
      task(async () => {
        if (++runs === 1) throw new Error("disk full");
        return "ok";
      }),
      { title: "Save" }
    );
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await job.done).toBeNull();
    expect(job.status).toBe(TaskJobStatus.FAILED);
    expect(job.error).toBe("disk full");
    expect(last()).toMatchObject({ type: NotificationType.ERROR, title: "Save failed", message: "disk full" });

    const id = job.id;
    expect(tasks.retry(id)).toBe(true);
    expect(await job.done).toBe("ok");
    expect(tasks.get(id)?.status).toBe(TaskJobStatus.DONE);
    expect(tasks.retry(id)).toBe(false);
  });

  test("message and progress from the work reach the job", async () => {
    const { tasks } = setup();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const job = tasks.run(
      "test",
      (context) =>
        createTask<void, void>({
          name: "work",
          async execute() {
            this.setProgress(0.5);
            context.message("1 of 2");
            await gate;
          },
        })(),
      { title: "Half" }
    );

    await vi.waitFor(() => expect(job.progress).toBe(0.5));
    expect(job.message).toBe("1 of 2");
    release();
    await job.done;
  });

  test("clear and remove drop only finished jobs", async () => {
    const { tasks } = setup();
    const done = tasks.run("test", task(async () => 1), { title: "Done" });
    const running = tasks.run("test", task(until_aborted), { title: "Running" });
    await done.done;

    tasks.remove(running.id);
    expect(tasks.jobs).toHaveLength(2);
    tasks.clear();
    expect(tasks.jobs.map((job) => job.title)).toEqual(["Running"]);

    running.cancel();
    await running.done;
  });
});
