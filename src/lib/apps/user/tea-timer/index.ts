import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "tea-timer",
  name: "Tea Timer",
  icon: AppIcon,
  category: AppCategory.PRODUCTIVITY,
  meta: () => import("./meta"),
  defaults: { constraints: { width: { min: 320 }, height: { min: 360 } } },
  highlights: () => import("./highlights"),
  component: () => import("./tea-timer.app.svelte"),
});
