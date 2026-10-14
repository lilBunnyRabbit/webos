import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { Clock as ClockIcon } from "phosphor-svelte";
import { CLOCK_PROPS } from "./clock";

export default define_app({
  id: "clock",
  name: "Clock",
  icon: ClockIcon,
  version: "1.0.0",
  category: AppCategory.PRODUCTIVITY,
  description: "World clock, alarms, timers and a stopwatch.",
  keywords: ["time", "alarm", "timer", "stopwatch", "countdown", "world clock", "time zone"],
  props: CLOCK_PROPS,
  defaults: { constraints: { width: { min: 320 }, height: { min: 360 } } },
  widget: () => import("./widget.svelte"),
  component: () => import("./clock.app.svelte"),
});
