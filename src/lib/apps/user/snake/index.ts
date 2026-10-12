import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { Path as PathIcon } from "phosphor-svelte";

export default define_app({
  id: "snake",
  name: "Snake",
  icon: PathIcon,
  version: "1.0.0",
  category: AppCategory.GAMES,
  description: "Classic Snake: eat, grow, don't bite yourself.",
  keywords: ["game", "arcade"],
  defaults: {
    constraints: {
      width: { min: 300 },
      height: { min: 380 },
    },
  },
  component: () => import("./snake.app.svelte"),
});
