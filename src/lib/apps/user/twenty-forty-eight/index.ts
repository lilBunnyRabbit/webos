import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "twenty-forty-eight",
  name: "2048",
  icon: AppIcon,
  version: "1.0.0",
  category: AppCategory.GAMES,
  description: "Slide and merge tiles to reach 2048",
  keywords: ["2048", "puzzle", "tiles", "merge", "numbers", "game", "sliding"],
  defaults: {
    constraints: {
      width: { min: 320 },
      height: { min: 420 },
    },
  },
  component: () => import("./twenty-forty-eight.app.svelte"),
});
