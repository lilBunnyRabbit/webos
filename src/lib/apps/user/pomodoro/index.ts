import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "pomodoro",
  name: "Pomodoro",
  icon: AppIcon,
  version: "1.0.0",
  category: AppCategory.PRODUCTIVITY,
  meta: () => import("./meta"),
  defaults: {
    constraints: {
      width: { min: 300 },
      height: { min: 380 },
    },
  },
  shell: () => import("./commands"),
  widget: () => import("./widget.svelte"),
  widget_size: { min: { w: 2, h: 2 }, max: { w: 4, h: 4 }, default: { w: 2, h: 2 } },
  component: () => import("./pomodoro.app.svelte"),
});
