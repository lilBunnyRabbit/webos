import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { DailyRank } from "$lib/core/games/daily";
import { z } from "zod";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "crack-the-code",
  name: "Crack the Code",
  icon: AppIcon,
  version: "1.0.0",
  category: AppCategory.GAMES,
  description: "Break a secret code of distinct digits. Each guess only tells you how many sit in the right place.",
  keywords: ["code", "cipher", "mastermind", "bulls and cows", "digits", "guess", "logic", "puzzle", "daily", "game"],
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
