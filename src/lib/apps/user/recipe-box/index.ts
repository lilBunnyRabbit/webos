import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { CookingPot as CookingPotIcon } from "phosphor-svelte";
import { z } from "zod";
import { APP_ID, COOK_FILES } from "./constants";

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
  shell: () => import("./commands"),
  highlights: () => import("./highlights"),
  component: () => import("./recipe-box.app.svelte"),
});
