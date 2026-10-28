import { define_app } from "$lib/core/api";
import { AppCategory, DailyRank } from "$lib/core/api/services/apps/type";
import { z } from "zod";
import { GAME_CHOICES, GAMES } from "./games";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "tight-spot",
  name: "Drive Hub",
  icon: AppIcon,
  category: AppCategory.GAMES,
  meta: () => import("./meta"),
  guide: () => import("./guide.md?raw"),
  defaults: {
    constraints: {
      width: { min: 360 },
      height: { min: 440 },
    },
  },
  props: z.object({
    daily: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    game: z.enum(GAME_CHOICES).optional(),
  }),
  daily_rank: DailyRank.SCORE_ASC,
  achievements: GAMES.flatMap((game) => game.achievements),
  component: () => import("./tight-spot.app.svelte"),
});
