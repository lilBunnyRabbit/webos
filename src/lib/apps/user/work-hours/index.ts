import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { WORK_HOURS_PROPS } from "./props";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "work-hours",
  name: "Work Hours",
  icon: AppIcon,
  version: "1.0.0",
  category: AppCategory.PRODUCTIVITY,
  meta: () => import("./meta"),
  props: WORK_HOURS_PROPS,
  defaults: {
    constraints: {
      width: { min: 340 },
      height: { min: 360 },
    },
  },
  shell: () => import("./commands"),
  widget: () => import("./widget.svelte"),
  widget_size: { min: { w: 2, h: 1 }, max: { w: 4, h: 3 }, default: { w: 2, h: 2 } },
  component: () => import("./work-hours.app.svelte"),
});
