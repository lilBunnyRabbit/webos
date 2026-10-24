import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "moonrabbit",
  name: "Moonrabbit",
  icon: AppIcon,
  version: "1.0.0",
  category: AppCategory.PRODUCTIVITY,
  meta: () => import("./meta"),
  defaults: { constraints: { width: { min: 340 }, height: { min: 420 } } },
  shell: () => import("./commands"),
  on_uninstall_data: () => import("./uninstall"),
  widget: () => import("./widget.svelte"),
  widget_size: { min: { w: 3, h: 2 }, max: { w: 5, h: 3 }, default: { w: 3, h: 2 } },
  component: () => import("./moonrabbit.app.svelte"),
});
