import { z } from "zod";
import kernel from "$lib/core/api";
import { arg } from "$lib/core/api/services/shell/arg";
import { define_command } from "$lib/core/api/services/shell/define";
import type { ShellContribution } from "$lib/core/api/services/shell/type";

const logic = () => import("./shell");

export default {
  completers: {
    setting: async (partial) => (await import("./search")).complete_setting(partial, kernel.platform),
  },
  commands: [
    define_command({
      id: "settings",
      description: "Open Settings, optionally at a page or a setting, like text-size",
      args: z.object({ setting: arg.kind("setting").optional().describe("A page or setting id") }),
      positional: ["setting"],
      run: async ({ args }) => (await logic()).open_settings(args.setting),
    }),
  ],
} satisfies ShellContribution;
