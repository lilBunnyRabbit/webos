import { define_app } from "$lib/core/api";
import { AppCategory, DailyRank } from "$lib/core/api/services/apps/type";
import { z } from "zod";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "lunar-lander",
  name: "Lunar Lander",
  icon: AppIcon,
  category: AppCategory.GAMES,
  meta: () => import("./meta"),
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
  daily_rank: DailyRank.TIME,
  achievements: [
    { id: "first-landing", title: "Touchdown", text: "Settle on a pad." },
    { id: "earth", title: "Heavy landing", text: "Settle on a pad in Earth gravity." },
    { id: "crosswind", title: "Crosswind", text: "Settle on a pad with the wind blowing 3 m/s or more." },
    { id: "every-ship", title: "Fleet pilot", text: "Land each of the three ships.", goal: 3 },
    { id: "landings-25", title: "Frequent flyer", text: "Settle on a pad 25 times.", goal: 25 },
    { id: "soft-touch", title: "Feather", text: "Touch down soft, level and dead centre.", secret: true },
  ],
  highlights: () => import("./highlights"),
  guide: () => import("./guide.md?raw"),
  component: () => import("./lunar-lander.app.svelte"),
});
