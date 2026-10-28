import { define_app } from "$lib/core/api";
import { AppCategory, DailyRank } from "$lib/core/api/services/apps/type";
import { z } from "zod";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "tight-spot",
  name: "Tight Spot",
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
  }),
  daily_rank: DailyRank.SCORE_ASC,
  achievements: [
    { id: "first-park", title: "Parked", text: "Park the car in a bay." },
    { id: "kerbside", title: "Kerbside", text: "Parallel park between two cars." },
    { id: "every-spot", title: "Every kind of spot", text: "Park in each of the fourteen kinds of spot.", goal: 14 },
    { id: "licensed", title: "Licensed", text: "Park every level.", goal: 42 },
    { id: "open-lot", title: "Any free bay", text: "Find a spot in the open lot." },
    { id: "daily", title: "Daily spot", text: "Park the daily spot." },
    { id: "perfect-park", title: "Perfect park", text: "Park with 95% precision or better: centred and square in the bay." },
    { id: "one-sweep", title: "One sweep", text: "Parallel park with a single reverse.", secret: true },
  ],
  component: () => import("./tight-spot.app.svelte"),
});
