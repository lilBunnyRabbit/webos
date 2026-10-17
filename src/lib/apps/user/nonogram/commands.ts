import { arg } from "$lib/core/api/services/shell/arg";
import { define_command } from "$lib/core/api/services/shell/define";
import { z } from "zod";
import type { ShellContribution } from "$lib/core/api/services/shell/type";
import { SIZES } from "./index";

const logic = () => import("./shell");

export default {
  commands: [
    define_command({
      id: "nonogram new",
      description: "A new puzzle, black and white unless --colour (your last size by default)",
      args: z.object({
        size: z.enum(SIZES).optional().describe("Cells per side"),
        colour: z.boolean().default(false).describe("A colour puzzle"),
      }),
      run: async (context) => (await logic()).new_puzzle(context),
    }),
    define_command({
      id: "nonogram daily",
      description: "Play the daily puzzle: today, or a past day (YYYY-MM-DD, yesterday, -N)",
      args: z.object({ day: z.string().optional() }),
      positional: ["day"],
      run: async (context) => (await logic()).daily(context),
    }),
    define_command({
      id: "nonogram edit",
      description: "Draw a puzzle: a new one, or edit a .nonogram file",
      args: z.object({ path: arg.path().optional() }),
      positional: ["path"],
      run: async (context) => (await logic()).edit(context),
    }),
    define_command({
      id: "nonogram check",
      description: "Whether a .nonogram file has exactly one answer",
      args: z.object({ path: arg.path() }),
      positional: ["path"],
      run: async (context) => (await logic()).check(context),
    }),
  ],
} satisfies ShellContribution;
