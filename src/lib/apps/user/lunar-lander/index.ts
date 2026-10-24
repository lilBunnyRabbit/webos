import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "lunar-lander",
  name: "Lunar Lander",
  icon: AppIcon,
  version: "0.1.0",
  category: AppCategory.GAMES,
  meta: () => import("./meta"),
  defaults: {
    constraints: {
      width: { min: 440 },
      height: { min: 320 },
    },
  },
  highlights: () => import("./highlights"),
  component: () => import("./lunar-lander.app.svelte"),
});
