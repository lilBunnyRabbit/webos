import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "airfield",
  name: "Airfield",
  icon: AppIcon,
  category: AppCategory.GAMES,
  meta: () => import("./meta"),
  guide: () => import("./guide.md?raw"),
  highlights: () => import("./highlights"),
  defaults: {
    constraints: {
      width: { min: 360 },
      height: { min: 440 },
    },
  },
  component: () => import("./airfield.app.svelte"),
});
