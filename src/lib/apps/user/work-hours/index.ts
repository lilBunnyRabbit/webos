import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { ClockUser as ClockUserIcon } from "phosphor-svelte";

export default define_app({
  id: "work-hours",
  name: "Work Hours",
  icon: ClockUserIcon,
  version: "1.0.0",
  category: AppCategory.PRODUCTIVITY,
  description: "Clock in and out, see your hours per day, week and month, print a time sheet.",
  keywords: ["time", "tracker", "timesheet", "hours", "clock in", "work"],
  defaults: {
    constraints: {
      width: { min: 340 },
      height: { min: 360 },
    },
  },
  widget: () => import("./widget.svelte"),
  component: () => import("./work-hours.app.svelte"),
});
