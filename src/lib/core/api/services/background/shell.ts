import { z } from "zod";
import { format_since } from "./format";
import { arg } from "../shell/arg";
import { define_command } from "../shell/define";
import { ShellError, type ShellContribution, type Tagged } from "../shell/type";
import type { BackgroundJob, BackgroundService } from "./type";

export interface BackgroundValue extends Tagged {
  $type: "background";
  app: string;
  status: string;
  since: number;
  tab: string;
}

const value = (job: BackgroundJob): BackgroundValue => ({
  $type: "background",
  app: job.app_id,
  status: job.status,
  since: job.since,
  tab: job.here ? "this" : job.solo ? `${job.tab} (solo)` : job.tab,
});

export function background_shell(background: BackgroundService): ShellContribution {
  return {
    commands: [
      define_command({
        id: "bg ls",
        description: "Apps running in the background, in any tab",
        yields: "background",
        *run() {
          for (const job of background.list()) yield value(job);
        },
      }),
      define_command({
        id: "bg stop",
        description: "Stop an app running in the background",
        args: z.object({ app: arg.app() }),
        positional: ["app"],
        available: () => background.list().length > 0,
        async run({ args }) {
          if (!(await background.stop(args.app))) throw new ShellError(`bg stop: ${args.app} isn't running in the background`);
        },
      }),
    ],
    values: {
      background: {
        columns: ["app", "status", "since", "tab"],
        cell: (job, column) => (column === "since" ? format_since(Number(job.since), Date.now()) : String(job[column] ?? "")),
        text: (job) => `${String(job.app)}  ${String(job.status)}  ${String(job.tab)}`,
      },
    },
  };
}
