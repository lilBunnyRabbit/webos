import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { SquaresFour as SquaresFourIcon } from "phosphor-svelte";

export default define_app({
  id: "twenty-forty-eight",
  name: "2048",
  icon: SquaresFourIcon,
  version: "1.0.0",
  category: AppCategory.GAMES,
  description: "Slide and merge tiles to reach 2048",
  keywords: ["puzzle", "tiles", "merge"],
  defaults: {
    constraints: {
      width: { min: 320 },
      height: { min: 420 },
    },
  },
  component: () => import("./twenty-forty-eight.app.svelte"),
});
