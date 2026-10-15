import { createTask } from "@lilbunnyrabbit/task-manager";
import kernel, { type TaskReport, type TasksService } from "$lib/core/api";
import type { AppId } from "$lib/core/api/services/apps/type";

export type JobReport = TaskReport & { title: string };

export interface JobStep {
  (label?: string): Promise<void>;
}

/** A counted job on TasksService: each `step` is one of `total`, and the place Cancel takes effect. */
export async function run_job(
  app_id: AppId,
  title: string,
  total: number,
  work: (step: JobStep) => Promise<JobReport>,
  signal?: AbortSignal
): Promise<boolean> {
  let done = 0;
  const job = kernel.service<TasksService>("tasks").run<JobReport>(
    app_id,
    (context) =>
      createTask<void, JobReport>({
        name: title,
        execute() {
          done = 0;
          return work(async (label) => {
            done++;
            this.setProgress(total ? done / total : 0);
            context.message(label ?? `${done} of ${total}`);
            await context.pace();
            context.signal.throwIfAborted();
          });
        },
      })(),
    {
      title,
      signal,
      done: (report) => report,
      failed: (_, cancelled) => (cancelled ? { title: "Stopped", message: `${done} of ${total} done` } : {}),
    }
  );
  return (await job.done) !== null;
}
