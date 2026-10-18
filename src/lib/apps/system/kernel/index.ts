import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "kernel",
  name: "Kernel",
  icon: AppIcon,
  version: "1.0.0",
  category: AppCategory.DEVELOPER,
  description: "Inspect the system services that run WebOS and their live state.",
  pitch: {
    problem: "It's hard to see what the system is doing behind the windows.",
    solution: "Inspect every service that runs WebOS and its live state.",
  },
  keywords: ["services", "system", "debug", "inspector", "internals", "registry"],
  component: () => import("./kernel.app.svelte"),
});
