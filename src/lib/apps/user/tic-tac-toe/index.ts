import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "tic-tac-toe",
  name: "Tic-Tac-Toe",
  icon: AppIcon,
  version: "1.0.0",
  category: AppCategory.GAMES,
  meta: () => import("./meta"),
  defaults: {
    constraints: {
      width: { min: 340 },
      height: { min: 420 },
    },
  },
  component: () => import("./tic-tac-toe.app.svelte"),
});
