import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "kernel",
  name: "Kernel",
  icon: AppIcon,
  category: AppCategory.DEVELOPER,
  meta: () => import("./meta"),
  guide: () => import("./guide.md?raw"),
  guide_on_launch: false,
  component: () => import("./kernel.app.svelte"),
});
