import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "shopping-list",
  name: "Shopping List",
  icon: AppIcon,
  version: "1.0.0",
  category: AppCategory.PRODUCTIVITY,
  meta: () => import("./meta"),
  defaults: { constraints: { width: { min: 300 }, height: { min: 400 } } },
  highlights: () => import("./highlights"),
  component: () => import("./shopping-list.app.svelte"),
});
