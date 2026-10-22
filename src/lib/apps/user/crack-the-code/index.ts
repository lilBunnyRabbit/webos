import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { DailyRank } from "$kit/games/daily";
import { z } from "zod";
import icon from "./icon.svg?no-inline";

export default define_app({
  id: "crack-the-code",
  name: "Crack the Code",
  icon,
  version: "1.0.0",
  category: AppCategory.GAMES,
  meta: () => import("./meta"),
  defaults: {
    constraints: {
      width: { min: 340 },
      height: { min: 560 },
    },
  },
  props: z.object({
    daily: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  }),
  daily_rank: DailyRank.SCORE_ASC,
  highlights: () => import("./highlights"),
  component: () => import("./crack-the-code.app.svelte"),
});
