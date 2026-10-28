import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "style-guide",
  name: "Style Guide",
  meta: () => import("./meta"),
  guide: () => import("./guide.md?raw"),
  guide_on_launch: false,
  icon: AppIcon,
  category: AppCategory.DEVELOPER,
  defaults: {
    constraints: {
      width: { min: 720 },
      height: { min: 520 },
    },
  },
  component: () => import("./style-guide.app.svelte"),
});
