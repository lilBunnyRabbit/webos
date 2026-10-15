import type { ExecutableTask } from "@lilbunnyrabbit/task-manager";
import type { Kernel, NotificationsService } from "$lib/core/api";
import type { AppId } from "../apps/type";
import { Job } from "./job.svelte";
import { tasks_shell } from "./shell";
import {
  TaskJobStatus,
  type TaskContext,
  type TaskJob,
  type TaskJobId,
  type TaskRunOptions,
  type TasksService as ITasksService,
} from "./type";

const HISTORY_CAP = 50;

export class TasksService implements ITasksService {
  name = "TasksService";
  description = "Background jobs with progress, Cancel and retry";
  inspector = () => import("./inspector.svelte");
  shell = () => tasks_shell(this);

  to_string(): string {
    return `TasksService: ${this.active_count} running, ${this.jobs.length} total`;
  }

  private list = $state<Job<unknown>[]>([]);

  public get jobs(): TaskJob[] {
    return this.list;
  }

  public get active_count(): number {
    return this.list.filter((job) => !job.finished).length;
  }

  private notifications!: NotificationsService;

  constructor(private kernel: Kernel) {
    this.notifications = $derived(this.kernel.service<NotificationsService>("notifications"));
  }

  run<T>(app_id: AppId, build: (context: TaskContext) => ExecutableTask, options: TaskRunOptions<T>): TaskJob<T> {
    const job = new Job<T>(app_id, build, options, this.notifications);
    this.list = [job as Job<unknown>, ...this.trimmed()];
    job.start();
    return job;
  }

  get(id: TaskJobId): TaskJob | undefined {
    return this.list.find((job) => job.id === id);
  }

  cancel(id: TaskJobId): void {
    this.find(id)?.cancel();
  }

  retry(id: TaskJobId): boolean {
    const job = this.find(id);
    if (!job?.finished || job.status === TaskJobStatus.DONE) return false;
    this.list = [job, ...this.list.filter((other) => other !== job)];
    job.start();
    return true;
  }

  remove(id: TaskJobId): void {
    this.list = this.list.filter((job) => job.id !== id || !job.finished);
  }

  clear(): void {
    this.list = this.list.filter((job) => !job.finished);
  }

  private find(id: TaskJobId): Job<unknown> | undefined {
    return this.list.find((job) => job.id === id);
  }

  private trimmed(): Job<unknown>[] {
    if (this.list.length < HISTORY_CAP) return this.list;
    const kept = [...this.list];
    for (let index = kept.length - 1; index >= 0 && kept.length >= HISTORY_CAP; index--) {
      if (kept[index].finished) kept.splice(index, 1);
    }
    return kept;
  }
}
