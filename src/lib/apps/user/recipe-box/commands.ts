import { arg } from "$lib/core/api/services/shell/arg";
import { define_command } from "$lib/core/api/services/shell/define";
import { z } from "zod";
import kernel, { type SchedulerService } from "$lib/core/api";
import { APP_ID, UnitSystem } from "./constants";
import type { ShellContribution } from "$lib/core/api/services/shell/type";

const logic = () => import("./shell");

export default {
  values: {
    ingredient: {
      columns: ["amount", "name", "note"],
      text: (value) => [value.amount, value.name, value.note && `(${value.note})`].filter(Boolean).join(" "),
      open: (value) => void logic().then((m) => m.open(String(value.path))),
    },
  },
  commands: [
    define_command({
      id: "recipe scale",
      description: "The ingredient list of a .cook recipe for a number of servings; click one to open the recipe",
      args: z.object({
        path: arg.path(),
        servings: z.number().positive().describe("Servings to cook for; a recipe without servings counts as 1"),
        units: z.enum([UnitSystem.METRIC, UnitSystem.IMPERIAL]).optional().describe("Convert amounts to metric or imperial"),
      }),
      positional: ["path", "servings"],
      short: { units: "u" },
      yields: "ingredient",
      complete: (field, partial, context) => (field === "path" ? logic().then((m) => m.complete_recipes(partial, context)) : undefined),
      async *run(context) {
        yield* (await logic()).scale(context);
      },
    }),
    define_command({
      id: "recipe timer stop",
      description: "Stop a cook timer, or clear one that's done",
      args: z.object({ timer: z.string().describe("Its id, like timer-1a2b3c4d, or its name") }),
      positional: ["timer"],
      available: () => kernel.service<SchedulerService>("scheduler").list(APP_ID).length > 0,
      run: async (context) => (await logic()).timer_stop(context),
    }),
  ],
} satisfies ShellContribution;
