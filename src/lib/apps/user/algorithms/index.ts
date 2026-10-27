import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import AppIcon from "./icon.svelte";
import { ALGORITHMS_PROPS } from "./props";

export default define_app({
  id: "algorithms",
  name: "Algorithms",
  icon: AppIcon,
  category: AppCategory.DEVELOPER,
  meta: () => import("./meta"),
  associations: [".algo"],
  props: ALGORITHMS_PROPS,
  defaults: { constraints: { width: { min: 360 }, height: { min: 420 } } },
  shell: () => import("./commands"),
  highlights: () => import("./highlights"),
  component: () => import("./algorithms.app.svelte"),
});
