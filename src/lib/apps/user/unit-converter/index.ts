import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "unit-converter",
  name: "Unit Converter",
  icon: AppIcon,
  category: AppCategory.UTILITIES,
  meta: () => import("./meta"),
  guide: () => import("./guide.md?raw"),
  guide_on_launch: false,
  defaults: { constraints: { width: { min: 320 }, height: { min: 360 } } },
  component: () => import("./unit-converter.app.svelte"),
});
