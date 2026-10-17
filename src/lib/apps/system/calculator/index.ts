import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "calculator",
  name: "Calculator",
  icon: AppIcon,
  version: "1.0.0",
  category: AppCategory.UTILITIES,
  description: "Basic arithmetic with brackets, percent and a history of results.",
  keywords: ["math", "calc", "arithmetic", "numbers", "sum", "percent", "maths"],
  defaults: { constraints: { width: { min: 280 }, height: { min: 360 } } },
  component: () => import("./calculator.app.svelte"),
});
