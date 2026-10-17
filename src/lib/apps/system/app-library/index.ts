import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "app-library",
  name: "App Library",
  icon: AppIcon,
  version: "1.0.0",
  category: AppCategory.UTILITIES,
  description: "Every installed app by category, with filters, details and what each one opens.",
  keywords: ["apps", "all apps", "launcher", "catalog", "programs", "applications", "browse"],
  defaults: { constraints: { width: { min: 340 }, height: { min: 360 } } },
  component: () => import("./app-library.app.svelte"),
});
