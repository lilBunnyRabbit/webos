import { define_command } from "$lib/core/api/services/shell/define";
import { z } from "zod";
import type { ShellContribution } from "$lib/core/api/services/shell/type";

const logic = () => import("./shell");

export default {
  values: {
    "gw2-objective": {
      columns: ["name", "progress", "done"],
      text: (objective) => `${objective.done ? "[x]" : "[ ]"} ${String(objective.progress).padEnd(9)} ${objective.name}`,
      cell: (objective, column) => (column === "done" ? (objective.done ? "[x]" : "[ ]") : String(objective[column])),
      open: () => void logic().then((m) => m.open()),
    },
  },
  commands: [
    define_command({
      id: "gw2 daily",
      description: "Today's Wizard's Vault objectives, with progress",
      args: z.object({}),
      yields: "gw2-objective",
      async *run() {
        yield* (await logic()).daily();
      },
    }),
  ],
} satisfies ShellContribution;
