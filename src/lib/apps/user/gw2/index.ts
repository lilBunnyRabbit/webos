import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { define_command } from "$lib/core/api/services/shell/define";
import { Sword as SwordIcon } from "phosphor-svelte";
import { z } from "zod";
import { SECTION_IDS } from "./sections";

const logic = () => import("./shell");

export default define_app({
  id: "gw2",
  name: "GW2 Tracker",
  icon: SwordIcon,
  version: "1.0.0",
  description: "Guild Wars 2 Wizard's Vault objectives, your wallet and crafting goals, from your API key.",
  keywords: ["guild wars", "gw2", "wizard's vault", "dailies", "wallet", "gold", "crafting", "goals", "mmo"],
  category: AppCategory.UTILITIES,
  props: z.object({ section: z.enum(SECTION_IDS).optional() }),
  defaults: { constraints: { width: { min: 320 }, height: { min: 360 } } },
  shell: {
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
  },
  highlights: () => import("./highlights"),
  component: () => import("./gw2.app.svelte"),
});
