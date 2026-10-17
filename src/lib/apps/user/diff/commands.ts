import { arg } from "$lib/core/api/services/shell/arg";
import { define_command } from "$lib/core/api/services/shell/define";
import { z } from "zod";
import type { ShellContribution } from "$lib/core/api/services/shell/type";

const logic = () => import("./shell");

export default {
  values: {
    "diff-stat": {
      columns: ["changes", "added", "removed"],
      text: (stat) => `${stat.changes} ${stat.changes === 1 ? "change" : "changes"}, +${stat.added} -${stat.removed}`,
      open: (stat) => void logic().then((m) => m.open_diff(String(stat.left), String(stat.right))),
    },
  },
  commands: [
    define_command({
      id: "diff",
      description: "Compare two files in Diff, or count the changes with --stat",
      args: z.object({
        left: arg.path(),
        right: arg.path(),
        stat: z.boolean().default(false).describe("Count changes, added and removed lines instead of opening Diff"),
      }),
      positional: ["left", "right"],
      yields: "diff-stat",
      run: async (context) => (await logic()).diff(context),
    }),
  ],
} satisfies ShellContribution;
