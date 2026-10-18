import { define_command } from "$lib/core/api/services/shell/define";
import type { ShellContribution } from "$lib/core/api/services/shell/type";
import { z } from "zod";
import { ALGORITHM_IDS, CATALOG, Group, GROUP_NAMES } from "./catalog";

const logic = () => import("./shell");

export default {
  values: {
    algorithm: {
      columns: ["id", "group", "average", "space"],
      text: (item) => `${String(item.id).padEnd(18)} ${String(item.group).padEnd(12)} ${String(item.average).padEnd(12)} ${item.space}`,
      open: (item) => void logic().then((m) => m.open(String(item.id))),
    },
  },
  commands: [
    define_command({
      id: "algo list",
      description: "Every algorithm Algorithms can show, with its group and complexity",
      args: z.object({ group: z.enum(Object.values(Group) as [Group, ...Group[]]).optional().describe("Only this group") }),
      positional: ["group"],
      yields: "algorithm",
      *run({ args }) {
        for (const item of CATALOG) {
          if (args.group && item.group !== args.group) continue;
          yield { $type: "algorithm", id: item.id, name: item.name, group: GROUP_NAMES[item.group], average: item.complexity.average, space: item.complexity.space };
        }
      },
    }),
    define_command({
      id: "algo",
      description: "Open Algorithms on an algorithm, optionally with an input: algo quick-sort 5,3,8",
      args: z.object({ id: z.enum(ALGORITHM_IDS), input: z.array(z.string()).default([]).describe("The input, as you'd type it in the app") }),
      positional: ["id", "input"],
      complete: (field, partial) =>
        field === "id" ? CATALOG.filter((item) => item.id.startsWith(partial)).map((item) => ({ value: item.id, label: item.id, detail: item.name })) : undefined,
      run: async ({ args }) => (await logic()).open(args.id, args.input.join(" ")),
    }),
  ],
} satisfies ShellContribution;
