import { define_app } from "$lib/core/api";
import { AppCategory, DailyRank } from "$lib/core/api/services/apps/type";
import { z } from "zod";
import { DAILY_GAMES, GAME_CHOICES, GAMES } from "./games";
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
    /** With `daily`, which game's daily (ADR-050): parking, the Warehouse, Hot Lap, Ferry Loader, Mow Day, Pushback or Rodeo. */
    mode: z.enum(DAILY_GAMES).optional(),
  }),
  daily_rank: {
    parking: DailyRank.SCORE_ASC,
    forklift: DailyRank.SCORE_ASC,
    f1: DailyRank.TIME,
    ferry: DailyRank.SCORE_ASC,
    mower: DailyRank.SCORE_ASC,
    pushback: DailyRank.SCORE_ASC,
    rodeo: DailyRank.TIME,
  },
  achievements: GAMES.flatMap((game) => game.achievements),
  component: () => import("./tight-spot.app.svelte"),
});
