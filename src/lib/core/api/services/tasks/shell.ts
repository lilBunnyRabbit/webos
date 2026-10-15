import { z } from "zod";
import { arg, ArgKind } from "../shell/arg";
import { define_command } from "../shell/define";
import { ShellError, type ShellContribution, type Tagged } from "../shell/type";
import { TaskJobStatus, type TaskJob, type TaskJobId, type TasksService } from "./type";

export interface TaskValue extends Tagged {
  $type: "task";
  id: TaskJobId;
  name: string;
  app: string;
  status: TaskJobStatus;
  progress: number;
  elapsed: number;
}

/** Job ids are UUIDs; the shell shows and accepts the first eight characters, like windows. */
const short_id = (id: TaskJobId) => id.slice(0, 8);

function value(job: TaskJob): TaskValue {
  return {
    $type: "task",
    id: job.id,
    name: job.title,
    app: job.app_id,
    status: job.status,
    progress: job.progress,
    elapsed: (job.finished_at ?? Date.now()) - job.created_at,
  };
}

function find(tasks: TasksService, typed: string): TaskJob {
  const matches = tasks.jobs.filter((job) => job.id.startsWith(typed));
  if (matches.length === 1) return matches[0];
  throw new ShellError(
    matches.length === 0 ? `no task ${typed}` : `${typed} matches ${matches.length} tasks; type more of the id`
  );
}

const seconds = (ms: number) => `${Math.round(ms / 100) / 10}s`;

export function tasks_shell(tasks: TasksService): ShellContribution {
  const any = () => tasks.jobs.length > 0;

  return {
    commands: [
      define_command({
        id: "task list",
        description: "Background tasks, newest first",
        yields: "task",
        *run() {
          for (const job of tasks.jobs) yield value(job);
        },
      }),
      define_command({
        id: "task cancel",
        description: "Cancel a running task",
        args: z.object({ id: arg.task() }),
        positional: ["id"],
        available: () => tasks.active_count > 0,
        run({ args }) {
          const job = find(tasks, args.id);
          if (job.status !== TaskJobStatus.RUNNING)
            throw new ShellError(`task cancel: ${short_id(job.id)} is ${job.status}`);
          job.cancel();
        },
      }),
      define_command({
        id: "task retry",
        description: "Run a failed or cancelled task again",
        args: z.object({ id: arg.task() }),
        positional: ["id"],
        available: any,
        run({ args }) {
          const job = find(tasks, args.id);
          if (!tasks.retry(job.id)) throw new ShellError(`task retry: ${short_id(job.id)} is ${job.status}`);
        },
      }),
      define_command({
        id: "task clear",
        description: "Clear finished tasks from the list",
        available: any,
        run() {
          const before = tasks.jobs.length;
          tasks.clear();
          const cleared = before - tasks.jobs.length;
          return `Cleared ${cleared} ${cleared === 1 ? "task" : "tasks"}`;
        },
      }),
    ],
    completers: {
      [ArgKind.TASK]: () =>
        tasks.jobs.map((job) => ({ value: short_id(job.id), detail: `${job.title} (${job.status})` })),
    },
    values: {
      task: {
        columns: ["id", "name", "app", "status", "progress", "elapsed"],
        cell: (task, column) => {
          if (column === "id") return short_id(String(task.id));
          if (column === "progress") return `${Math.round(Number(task.progress) * 100)}%`;
          if (column === "elapsed") return seconds(Number(task.elapsed));
          return String(task[column] ?? "");
        },
        text: (task) => `${short_id(String(task.id))}  ${String(task.name)}  ${String(task.status)}`,
      },
    },
  };
}
