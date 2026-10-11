import { define_app } from "$lib/core/api";
import { Pulse as PulseIcon } from "phosphor-svelte";

export default define_app({
  id: "activity-monitor",
  name: "Activity Monitor",
  icon: PulseIcon,
  version: "1.0.0",
  categories: ["system"],
  defaults: {
    constraints: {
      width: { min: 480 },
      height: { min: 360 },
    },
  },
  component: () => import("./activity-monitor.app.svelte"),
});
