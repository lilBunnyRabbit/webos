import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { Checkerboard as CheckerboardIcon } from "phosphor-svelte";

export default define_app({
  id: "nonogram",
  name: "Nonogram",
  icon: CheckerboardIcon,
  version: "1.0.0",
  category: AppCategory.GAMES,
  description: "Fill the grid from the number clues to reveal a picture.",
  keywords: ["picross", "griddlers", "puzzle", "logic"],
  defaults: {
    constraints: {
      width: { min: 340 },
      height: { min: 400 },
    },
  },
  component: () => import("./nonogram.app.svelte"),
});
