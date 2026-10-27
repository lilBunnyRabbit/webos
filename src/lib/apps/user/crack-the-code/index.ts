import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { DailyRank } from "$kit/games/daily";
import { z } from "zod";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "crack-the-code",
  name: "Crack the Code",
  icon: AppIcon,
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
  achievements: [
    { id: "first-crack", title: "Case closed", text: "Crack a code." },
    { id: "daily", title: "Daily case", text: "Crack a daily case." },
    { id: "seven", title: "Seven digits", text: "Crack a 7-digit code." },
    { id: "cracks-25", title: "Codebreaker", text: "Crack 25 codes.", goal: 25 },
    { id: "hunch", title: "Hunch", text: "Crack a code of 4 digits or more in 5 guesses or fewer.", secret: true },
  ],
  highlights: () => import("./highlights"),
  component: () => import("./crack-the-code.app.svelte"),
});
