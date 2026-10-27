import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "motion-watch",
  name: "Motion Watch",
  icon: AppIcon,
  category: AppCategory.MEDIA,
  meta: () => import("./meta"),
  highlights: () => import("./highlights"),
  defaults: { constraints: { width: { min: 320 }, height: { min: 420 } } },
  background: () => import("./watch.svelte"),
  component: () => import("./motion-watch.app.svelte"),
});
