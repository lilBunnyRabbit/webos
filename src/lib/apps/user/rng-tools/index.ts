import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import icon from "./icon.svg?no-inline";

export default define_app({
  id: "rng-tools",
  name: "RNG Tools",
  icon,
  version: "1.0.0",
  category: AppCategory.UTILITIES,
  meta: () => import("./meta"),
  defaults: { constraints: { width: { min: 320 }, height: { min: 360 } } },
  component: () => import("./rng-tools.app.svelte"),
});
