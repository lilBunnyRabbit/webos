import { define_command } from "$lib/core/api/services/shell/define";
import { z } from "zod";
import type { ShellContribution } from "$lib/core/api/services/shell/type";

const logic = () => import("./task");

export default {
  commands: [
    define_command({
      id: "example task",
      description: "Run the example background task, about 20 s; --fail makes its first run fail",
      args: z.object({ fail: z.boolean().default(false).describe("Fail once while packing, to try Retry") }),
      short: { fail: "f" },
      run: async ({ args }) => {
        const job = (await logic()).run_example_task(args.fail);
        return `Started ${job.title}: see Activity Monitor › Tasks`;
      },
    }),
  ],
} satisfies ShellContribution;
