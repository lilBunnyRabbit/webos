import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import icon from "./icon.svg?no-inline";

export default define_app({
  id: "maze",
  name: "Maze",
  icon,
  version: "1.0.0",
  category: AppCategory.GAMES,
  meta: () => import("./meta"),
  defaults: {
    constraints: {
      width: { min: 320 },
      height: { min: 400 },
    },
  },
  component: () => import("./maze.app.svelte"),
});
