import { define_app } from "$lib/core/api";
import { AppCategory, DailyRank } from "$lib/core/api/services/apps/type";
import { z } from "zod";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "airfield",
  name: "Airfield",
  icon: AppIcon,
  category: AppCategory.GAMES,
  meta: () => import("./meta"),
  guide: () => import("./guide.md?raw"),
  highlights: () => import("./highlights"),
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
  }),
  daily_rank: DailyRank.SCORE_ASC,
  achievements: [
    { id: "airfield-first", title: "Wheels down", text: "Finish a round for the first time." },
    { id: "airfield-kiss", title: "Greaser", text: "Land in a round with a kiss and no bounce." },
    { id: "airfield-three", title: "Three stars", text: "Finish a level gently and under par." },
    { id: "airfield-deadstick", title: "Deadstick", text: "Land with a dead engine." },
    { id: "airfield-levels", title: "Logbook", text: "Finish every level of every plane.", goal: 20 },
    { id: "airfield-daily", title: "Daily flight", text: "Finish the daily." },
    { id: "airfield-swap", title: "Type rating", text: "Swap planes in the hangar.", secret: true },
  ],
  component: () => import("./airfield.app.svelte"),
});
