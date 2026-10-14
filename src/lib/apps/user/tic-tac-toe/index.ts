import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { GridNine as GridNineIcon } from "phosphor-svelte";

export default define_app({
  id: "tic-tac-toe",
  name: "Tic-Tac-Toe",
  icon: GridNineIcon,
  version: "1.0.0",
  category: AppCategory.GAMES,
  keywords: ["noughts and crosses", "x and o", "xo", "game", "classic", "two player"],
  defaults: {
    constraints: {
      width: { min: 340 },
      height: { min: 420 },
    },
  },
  component: () => import("./tic-tac-toe.app.svelte"),
});
