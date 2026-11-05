import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "glimpse",
  name: "Glimpse",
  icon: AppIcon,
  category: AppCategory.MEDIA,
  meta: () => import("./meta"),
  highlights: () => import("./highlights"),
  guide: () => import("./guide.md?raw"),
  defaults: { constraints: { width: { min: 320 }, height: { min: 460 } } },
  component: () => import("./glimpse.app.svelte"),
});
