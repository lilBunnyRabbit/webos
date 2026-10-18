import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "rng-tools",
  name: "RNG Tools",
  icon: AppIcon,
  version: "1.0.0",
  category: AppCategory.UTILITIES,
  description: "Random numbers, lottery-style draws, dice, coin flips, list picks and passwords",
  pitch: {
    problem: "Deciding who goes first or making a password needs a fair coin.",
    solution: "Random numbers, draws, dice, coin flips, list picks and passwords.",
  },
  keywords: ["random", "dice", "coin", "password", "shuffle", "picker", "teams", "lottery", "draw", "generator"],
  defaults: { constraints: { width: { min: 320 }, height: { min: 360 } } },
  component: () => import("./rng-tools.app.svelte"),
});
