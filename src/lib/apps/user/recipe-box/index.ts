import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { arg } from "$lib/core/api/services/shell/arg";
import { define_command } from "$lib/core/api/services/shell/define";
import { CookingPot as CookingPotIcon } from "phosphor-svelte";
import { z } from "zod";
import { APP_ID, COOK_FILES, UnitSystem } from "./constants";

const logic = () => import("./shell");

export default define_app({
  id: APP_ID,
  name: "Recipe Box",
  icon: CookingPotIcon,
  version: "1.0.0",
  category: AppCategory.PRODUCTIVITY,
  description: "Recipes as Cooklang .cook files: scale servings, switch metric and imperial, cook step by step with timers.",
  keywords: ["recipe", "cooking", "cooklang", "cook", "kitchen", "ingredients", "servings", "food", "meal", "timer", "baking"],
  associations: COOK_FILES,
  props: z.object({ path: z.string().optional() }),
  defaults: { constraints: { width: { min: 320 }, height: { min: 360 } } },
  shell: {
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
    ],
  },
  highlights: () => import("./highlights"),
  component: () => import("./recipe-box.app.svelte"),
});
