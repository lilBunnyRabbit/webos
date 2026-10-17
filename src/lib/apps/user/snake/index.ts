import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "snake",
  name: "Snake",
  icon: AppIcon,
  version: "1.0.0",
  category: AppCategory.GAMES,
  description: "Classic Snake: eat, grow, don't bite yourself.",
  keywords: ["game", "arcade", "classic", "retro"],
  defaults: {
    constraints: {
      width: { min: 300 },
      height: { min: 380 },
    },
  },
  component: () => import("./snake.app.svelte"),
});
