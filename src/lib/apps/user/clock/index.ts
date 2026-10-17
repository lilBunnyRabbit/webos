import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { CLOCK_PROPS } from "./props";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "clock",
  name: "Clock",
  icon: AppIcon,
  version: "1.0.0",
  category: AppCategory.PRODUCTIVITY,
  description: "World clock, alarms, timers and a stopwatch.",
  keywords: ["time", "clock", "alarm", "timer", "stopwatch", "countdown", "world clock", "time zone", "wake up"],
  props: CLOCK_PROPS,
  defaults: { constraints: { width: { min: 320 }, height: { min: 360 } } },
  shell: () => import("./commands"),
  widget: () => import("./widget.svelte"),
  widget_size: { min: { w: 2, h: 2 }, max: { w: 6, h: 4 }, default: { w: 3, h: 2 } },
  component: () => import("./clock.app.svelte"),
});
