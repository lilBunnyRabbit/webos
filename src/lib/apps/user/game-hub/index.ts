import { z } from "zod";
import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { GameController as GameControllerIcon } from "phosphor-svelte";
import { HUB_ID, Tab } from "./hub";

export default define_app({
  id: HUB_ID,
  name: "Game Hub",
  icon: GameControllerIcon,
  version: "1.0.0",
  category: AppCategory.GAMES,
  description: "Every game in one place, with play time, stats and today's daily puzzles.",
  keywords: ["games", "library", "daily", "puzzle", "streak", "stats"],
  props: z.object({ tab: z.enum(Tab).optional() }),
  defaults: {
    constraints: {
      width: { min: 340 },
      height: { min: 360 },
    },
  },
  widget: () => import("./widget.svelte"),
  component: () => import("./game-hub.app.svelte"),
});
