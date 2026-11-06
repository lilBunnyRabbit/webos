import { define_app } from "$lib/core/api";
import { AppCategory, DailyRank } from "$lib/core/api/services/apps/type";
import { z } from "zod";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "harbour",
  name: "Harbour",
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
    { id: "harbour-first", title: "Lines on", text: "Dock a boat for the first time." },
    { id: "harbour-perfect", title: "Perfect berth", text: "Dock with 95% precision or better." },
    { id: "harbour-three", title: "Three stars", text: "Dock in a level gently and on time." },
    { id: "harbour-box", title: "Prop walk", text: "Put the yacht in a box berth." },
    { id: "harbour-levels", title: "Harbour master", text: "Dock in every level.", goal: 8 },
    { id: "harbour-daily", title: "Daily berth", text: "Dock the daily." },
    { id: "harbour-swap", title: "Change of boat", text: "Swap boats in the boat shed.", secret: true },
  ],
  component: () => import("./harbour.app.svelte"),
});
