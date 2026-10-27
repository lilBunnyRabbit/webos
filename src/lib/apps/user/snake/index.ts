import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "snake",
  name: "Snake",
  icon: AppIcon,
  category: AppCategory.GAMES,
  meta: () => import("./meta"),
  defaults: {
    constraints: {
      width: { min: 300 },
      height: { min: 380 },
    },
  },
  achievements: [
    { id: "first-point", title: "First bite", text: "Score a point." },
    { id: "score-50", title: "Long snake", text: "Score 50 in one game.", goal: 50 },
    { id: "fast-25", title: "Fast lane", text: "Score 25 on Fast with walls." },
    { id: "eaten-500", title: "Bottomless", text: "Score 500 points in all.", goal: 500 },
    { id: "full-board", title: "Nowhere left", text: "Fill the whole board.", secret: true },
  ],
  component: () => import("./snake.app.svelte"),
});
