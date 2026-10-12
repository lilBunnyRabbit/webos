import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { DiceFive as DiceFiveIcon } from "phosphor-svelte";

export default define_app({
  id: "rng-tools",
  name: "RNG Tools",
  icon: DiceFiveIcon,
  version: "1.0.0",
  category: AppCategory.UTILITIES,
  description: "Random numbers, dice, coin flips, list picks and passwords",
  keywords: ["random", "dice", "coin", "password", "shuffle", "picker", "teams"],
  defaults: { constraints: { width: { min: 320 }, height: { min: 360 } } },
  component: () => import("./rng-tools.app.svelte"),
});
