import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "maze",
  name: "Maze",
  icon: AppIcon,
  category: AppCategory.GAMES,
  meta: () => import("./meta"),
  defaults: {
    constraints: {
      width: { min: 320 },
      height: { min: 400 },
    },
  },
  achievements: [
    { id: "first-exit", title: "Way out", text: "Find the exit in Play." },
    { id: "giant", title: "Labyrinth", text: "Find the exit of a 48 × 48 maze." },
    { id: "every-size", title: "Every size", text: "Find the exit of a maze in every size.", goal: 5 },
    { id: "watched", title: "Pathfinder", text: "Watch a solver find the way through." },
    { id: "escapes-25", title: "Maze runner", text: "Find the exit 25 times.", goal: 25 },
    { id: "straight-shot", title: "Straight shot", text: "Get through a 24 × 24 maze or larger without a single wrong turn.", secret: true },
  ],
  component: () => import("./maze.app.svelte"),
});
