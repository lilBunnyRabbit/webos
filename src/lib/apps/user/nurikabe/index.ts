import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { Island as IslandIcon } from "phosphor-svelte";

export default define_app({
  id: "nurikabe",
  name: "Nurikabe",
  icon: IslandIcon,
  version: "1.0.0",
  category: AppCategory.GAMES,
  description: "Shade the sea so every number becomes an island of exactly that size.",
  keywords: ["islands", "sea", "wall", "nikoli", "puzzle", "logic"],
  defaults: {
    constraints: {
      width: { min: 340 },
      height: { min: 420 },
    },
  },
  component: () => import("./nurikabe.app.svelte"),
});
