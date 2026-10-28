import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import AppIcon from "./icon.svelte";
import { APP_LIBRARY_PROPS } from "./props";

export default define_app({
  id: "app-library",
  name: "App Store",
  icon: AppIcon,
  category: AppCategory.UTILITIES,
  meta: () => import("./meta"),
  guide: () => import("./guide.md?raw"),
  guide_on_launch: false,
  props: APP_LIBRARY_PROPS,
  defaults: { constraints: { width: { min: 340 }, height: { min: 360 } } },
  component: () => import("./app-library.app.svelte"),
});
