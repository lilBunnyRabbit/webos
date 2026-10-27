import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "rng-tools",
  name: "RNG Tools",
  icon: AppIcon,
  category: AppCategory.UTILITIES,
  meta: () => import("./meta"),
  defaults: { constraints: { width: { min: 320 }, height: { min: 360 } } },
  component: () => import("./rng-tools.app.svelte"),
});
