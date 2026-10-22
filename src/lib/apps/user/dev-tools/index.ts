import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import icon from "./icon.svg?no-inline";

export default define_app({
  id: "dev-tools",
  name: "Dev Tools",
  icon,
  version: "1.0.0",
  meta: () => import("./meta"),
  category: AppCategory.DEVELOPER,
  defaults: { constraints: { width: { min: 320 }, height: { min: 320 } } },
  shell: () => import("./commands"),
  component: () => import("./dev-tools.app.svelte"),
});
