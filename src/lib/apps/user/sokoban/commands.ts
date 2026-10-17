import { define_command } from "$lib/core/api/services/shell/define";
import { z } from "zod";
import type { ShellContribution } from "$lib/core/api/services/shell/type";

const logic = () => import("./shell");

export default {
  commands: [
    define_command({
      id: "sokoban daily",
      description: "Play the daily level: today, or a past day (YYYY-MM-DD, yesterday, -N)",
      args: z.object({ day: z.string().optional() }),
      positional: ["day"],
      run: async (context) => (await logic()).daily(context),
    }),
  ],
} satisfies ShellContribution;
