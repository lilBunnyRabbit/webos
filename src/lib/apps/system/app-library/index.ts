import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import icon from "./icon.svg?no-inline";
import { APP_LIBRARY_PROPS } from "./props";

export default define_app({
  id: "app-library",
  name: "App Library",
  icon,
  version: "1.0.0",
  category: AppCategory.UTILITIES,
  meta: () => import("./meta"),
  props: APP_LIBRARY_PROPS,
  defaults: { constraints: { width: { min: 340 }, height: { min: 360 } } },
  component: () => import("./app-library.app.svelte"),
});
