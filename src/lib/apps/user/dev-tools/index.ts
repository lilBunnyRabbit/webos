import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "dev-tools",
  name: "Dev Tools",
  icon: AppIcon,
  version: "1.0.0",
  meta: () => import("./meta"),
  category: AppCategory.DEVELOPER,
  defaults: { constraints: { width: { min: 320 }, height: { min: 320 } } },
  shell: () => import("./commands"),
  component: () => import("./dev-tools.app.svelte"),
});
