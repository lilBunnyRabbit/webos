import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { Pulse as PulseIcon } from "phosphor-svelte";

export default define_app({
  id: "activity-monitor",
  name: "Activity Monitor",
  icon: PulseIcon,
  version: "1.0.0",
  category: AppCategory.DEVELOPER,
  description: "What's running and how hard it works: windows, widgets, frame rate, network and storage.",
  keywords: [
    "task manager",
    "processes",
    "performance",
    "fps",
    "memory",
    "storage",
    "network",
    "profiler",
    "monitor",
    "widgets",
  ],
  defaults: {
    constraints: {
      width: { min: 480 },
      height: { min: 360 },
    },
  },
  component: () => import("./activity-monitor.app.svelte"),
});
