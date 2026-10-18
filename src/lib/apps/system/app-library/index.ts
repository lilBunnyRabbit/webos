import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import AppIcon from "./icon.svelte";
import { APP_LIBRARY_PROPS } from "./props";

export default define_app({
  id: "app-library",
  name: "App Library",
  icon: AppIcon,
  version: "1.0.0",
  category: AppCategory.UTILITIES,
  description:
    "Every app by category, with a showcase of what each one solves, filters, details and what each one opens.",
  pitch: {
    problem: "With dozens of apps, it's hard to know what's there or what each one is for.",
    solution: "Browse every app by category, read what it solves, and get or open it in one click.",
  },
  keywords: ["apps", "all apps", "launcher", "catalog", "programs", "applications", "browse", "showcase", "store"],
  props: APP_LIBRARY_PROPS,
  defaults: { constraints: { width: { min: 340 }, height: { min: 360 } } },
  component: () => import("./app-library.app.svelte"),
});
