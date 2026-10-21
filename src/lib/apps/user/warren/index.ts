import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { FILE_PROPS } from "$lib/core/api/services/apps/helpers";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "warren",
  name: "Warren",
  icon: AppIcon,
  version: "1.0.0",
  meta: () => import("./meta"),
  category: AppCategory.PRODUCTIVITY,
  associations: [".warren"],
  props: FILE_PROPS,
  highlights: () => import("./highlights"),
  defaults: { constraints: { width: { min: 340 }, height: { min: 400 } } },
  shell: () => import("./commands"),
  component: () => import("./warren.app.svelte"),
});
