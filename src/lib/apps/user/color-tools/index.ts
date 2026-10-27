import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { FILE_PROPS } from "$lib/core/api/services/apps/helpers";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "color-tools",
  name: "Color Tools",
  icon: AppIcon,
  meta: () => import("./meta"),
  category: AppCategory.UTILITIES,
  associations: [".palette"],
  props: FILE_PROPS,
  highlights: () => import("./highlights"),
  defaults: { constraints: { width: { min: 340 }, height: { min: 420 } } },
  component: () => import("./color-tools.app.svelte"),
});
