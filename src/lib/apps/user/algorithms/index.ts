import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import icon from "./icon.svg?no-inline";
import { ALGORITHMS_PROPS } from "./props";

export default define_app({
  id: "algorithms",
  name: "Algorithms",
  icon,
  version: "1.0.0",
  category: AppCategory.DEVELOPER,
  meta: () => import("./meta"),
  associations: [".algo"],
  props: ALGORITHMS_PROPS,
  defaults: { constraints: { width: { min: 360 }, height: { min: 420 } } },
  shell: () => import("./commands"),
  highlights: () => import("./highlights"),
  component: () => import("./algorithms.app.svelte"),
});
