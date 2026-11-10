import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { FILE_PROPS } from "$lib/core/api/services/apps/helpers";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "wireframe",
  name: "Wireframe",
  icon: AppIcon,
  meta: () => import("./meta"),
  category: AppCategory.UTILITIES,
  associations: [".wire"],
  props: FILE_PROPS,
  highlights: () => import("./highlights"),
  guide: () => import("./guide.md?raw"),
  defaults: { constraints: { width: { min: 340 }, height: { min: 480 } } },
  component: () => import("./wireframe.app.svelte"),
});
