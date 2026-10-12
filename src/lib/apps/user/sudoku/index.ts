import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { GridNine as GridNineIcon } from "phosphor-svelte";

export default define_app({
  id: "sudoku",
  name: "Sudoku",
  icon: GridNineIcon,
  version: "1.0.0",
  category: AppCategory.GAMES,
  description: "Fill the grid so every row, column and box holds 1 to 9 once.",
  keywords: ["number", "puzzle", "logic", "9x9", "numbers"],
  defaults: {
    constraints: {
      width: { min: 340 },
      height: { min: 480 },
    },
  },
  component: () => import("./sudoku.app.svelte"),
});
