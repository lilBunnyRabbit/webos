import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "maze",
  name: "Maze",
  icon: AppIcon,
  version: "1.0.0",
  category: AppCategory.GAMES,
  description: "Watch mazes being built and solved, then race through them yourself.",
  keywords: ["labyrinth", "pathfinding", "a-star", "bfs", "puzzle", "game", "algorithm"],
  defaults: {
    constraints: {
      width: { min: 320 },
      height: { min: 400 },
    },
  },
  component: () => import("./maze.app.svelte"),
});
