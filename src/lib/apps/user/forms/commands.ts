import { arg } from "$lib/core/api/services/shell/arg";
import { define_command } from "$lib/core/api/services/shell/define";
import type { ShellSession } from "$lib/core/api/services/shell/type";
import { z } from "zod";
import type { ShellContribution } from "$lib/core/api/services/shell/type";

const logic = () => import("./shell");

export default {
  commands: [
    define_command({
      id: "form link",
      description: "A link that opens the form for filling in, with the whole form inside it",
      args: z.object({ path: arg.path(), copy: z.boolean().default(false).describe("Copy it too") }),
      positional: ["path"],
      short: { copy: "c" },
      complete: (field: string, partial: string, context: { session: ShellSession }) =>
        field === "path" ? logic().then((m) => m.complete_forms(partial, context)) : undefined,
      run: async (context) => (await logic()).link(context),
    }),
    define_command({
      id: "form answer",
      description: "Saves an answer code beside the form it belongs to, found by the form's id",
      args: z.object({ code: z.string().describe("The answer code, or an answer link") }),
      positional: ["code"],
      run: async (context) => (await logic()).answer(context),
    }),
  ],
} satisfies ShellContribution;
