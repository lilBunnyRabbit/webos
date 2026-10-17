import { z } from "zod";
import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { GameController as GameControllerIcon } from "phosphor-svelte";
import { HUB_ID, Tab } from "./labels";

export default define_app({
  id: HUB_ID,
  name: "Game Hub",
  icon: GameControllerIcon,
  version: "1.0.0",
  category: AppCategory.GAMES,
  description: "Every game in one place, with play time, stats and today's daily puzzles.",
  keywords: ["games", "game", "library", "launcher", "daily", "puzzle", "streak", "stats", "play time"],
  props: z.object({ tab: z.enum(Tab).optional() }),
  defaults: {
    constraints: {
      width: { min: 340 },
      height: { min: 360 },
    },
  },
  shell: () => import("./commands"),
  highlights: () => import("./highlights"),
  widget: () => import("./widget.svelte"),
  widget_size: { min: { w: 3, h: 1 }, max: { w: 6, h: 4 }, default: { w: 4, h: 2 } },
  default_widget: true,
  component: () => import("./game-hub.app.svelte"),
});
