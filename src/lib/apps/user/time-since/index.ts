import { z } from "zod";
import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import AppIcon from "./icon.svelte";

export const TIME_SINCE_PROPS = z.object({ counter: z.string().optional() });

export default define_app({
  id: "time-since",
  name: "Time Since",
  icon: AppIcon,
  version: "1.0.0",
  category: AppCategory.PRODUCTIVITY,
  meta: () => import("./meta"),
  props: TIME_SINCE_PROPS,
  defaults: {
    constraints: {
      width: { min: 320 },
      height: { min: 360 },
    },
  },
  shell: () => import("./commands"),
  widget: () => import("./widget.svelte"),
  widget_size: { min: { w: 2, h: 1 }, max: { w: 5, h: 3 }, default: { w: 3, h: 1 } },
  component: () => import("./time-since.app.svelte"),
});
