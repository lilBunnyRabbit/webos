import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "kernel",
  name: "Kernel",
  icon: AppIcon,
  version: "1.0.0",
  category: AppCategory.DEVELOPER,
  meta: () => import("./meta"),
  component: () => import("./kernel.app.svelte"),
});
