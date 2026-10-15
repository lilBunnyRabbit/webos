import { createTask, createTaskGroup, ExecutionMode } from "@lilbunnyrabbit/task-manager";
import kernel, { TaskJobStatus, type TaskReport, type TasksService } from "$lib/core/api";
import type { AppId } from "$lib/core/api/services/apps/type";

export type JobReport = TaskReport & { title: string };

/** One unit of a job: a page, a file or a part. Its string result goes to the task's log. */
export interface JobUnit {
  name: string;
  status?: string;
  run(): Promise<string | void>;
}

/**
 * A sequential group with one task per unit. `build` runs again on Retry, so state the units share (a document being
 * written) belongs inside it.
 */
export async function run_job(
  app_id: AppId,
  title: string,
  build: () => JobUnit[],
  report: () => JobReport,
  signal?: AbortSignal
): Promise<boolean> {
  let done = 0;
  let total = 0;
  const job = kernel.service<TasksService>("tasks").run<void>(
    app_id,
    (context) => {
      const units = build();
      done = 0;
      total = units.length;
      return createTaskGroup({
        name: title,
        mode: ExecutionMode.SEQUENTIAL,
        tasks: () =>
          units.map((unit) =>
            createTask<void, void>({
              name: unit.name,
              parse: unit.status ? () => ({ status: unit.status }) : undefined,
              async execute() {
                context.signal.throwIfAborted();
                const line = await unit.run();
                if (line) this.logger.info(line);
                this.setProgress(1);
                done++;
                context.message(`${done} of ${total}`);
                await context.pace();
              },
            })()
          ),
      })();
    },
    {
      title,
      signal,
      done: report,
      failed: (_, cancelled) => (cancelled ? { title: "Stopped", message: `${done} of ${total} done` } : {}),
    }
  );
  await job.done;
  return job.status === TaskJobStatus.DONE;
}
