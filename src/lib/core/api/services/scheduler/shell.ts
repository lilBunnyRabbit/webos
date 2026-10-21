import { z } from "zod";
import { format_datetime } from "$lib/core/utils";
import { when_examples } from "$lib/core/utils/when";
import { local_zone } from "$lib/core/utils/zoned";
import { arg, ArgKind } from "../shell/arg";
import { define_command } from "../shell/define";
import { ShellError, type ShellContribution, type Tagged } from "../shell/type";
import { format_repeat } from "./occurrence";
import type { Job, JobId, SchedulerService } from "./type";

export interface JobValue extends Tagged {
  $type: "job";
  id: JobId;
  app: string;
  title: string;
  kind: string;
  next: number | null;
  repeat: string;
  armed: boolean;
}

function value(scheduler: SchedulerService, job: Job): JobValue {
  return { $type: "job", id: job.id, app: job.app, title: job.title, kind: job.kind, next: scheduler.next(job.id), repeat: format_repeat(job.repeat), armed: job.armed };
}

function find_job(jobs: Job[], typed: string): Job {
  const exact = jobs.find((job) => job.id === typed);
  if (exact) return exact;
  const by_id = jobs.filter((job) => job.id.startsWith(typed));
  if (by_id.length === 1) return by_id[0];
  if (by_id.length > 1) throw new ShellError(`${typed} matches ${by_id.length} jobs; type more of the id`);
  const by_title = jobs.filter((job) => job.title.toLowerCase() === typed.toLowerCase());
  if (by_title.length === 1) return by_title[0];
  throw new ShellError(by_title.length > 1 ? `more than one job is called "${typed}"; use its id` : `no job ${typed}`);
}

export function scheduler_shell(scheduler: SchedulerService, open: (job: Job) => void): ShellContribution {
  return {
    commands: [
      define_command({
        id: "sched ls",
        description: "Scheduled alarms, timers and reminders, soonest first",
        args: z.object({ app: arg.app().optional() }),
        positional: ["app"],
        yields: "job",
        *run({ args }) {
          const values = scheduler.list(args.app).map((job) => value(scheduler, job));
          values.sort((a, b) => (a.next ?? Infinity) - (b.next ?? Infinity));
          yield* values;
        },
      }),
      define_command({
        id: "sched rm",
        description: "Cancel a scheduled job",
        args: z.object({ job: arg.job() }),
        positional: ["job"],
        available: () => scheduler.jobs.length > 0,
        async run({ args }) {
          const job = find_job(scheduler.jobs, args.job);
          await scheduler.cancel(job.id);
          return `Cancelled ${job.title || job.id}`;
        },
      }),
    ],
    completers: {
      [ArgKind.JOB]: () => scheduler.jobs.map((job) => ({ value: job.id, detail: job.title })),
      [ArgKind.WHEN]: () => when_examples(Date.now(), local_zone()).map((example) => ({ value: example })),
    },
    values: {
      job: {
        columns: ["app", "title", "next", "repeat"],
        cell: (job, column) => {
          if (column !== "next") return String(job[column] ?? "");
          if (job.next === null) return job.armed ? "never" : "off";
          return format_datetime(Number(job.next));
        },
        text: (job) => `${String(job.id)}  ${String(job.title)}  ${job.next === null ? "off" : format_datetime(Number(job.next))}`,
        open: (job) => {
          const found = scheduler.get(String(job.id));
          if (found) open(found);
        },
      },
    },
  };
}
