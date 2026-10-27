import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { z } from "zod";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "plots",
  name: "Plots",
  icon: AppIcon,
  category: AppCategory.GAMES,
  meta: () => import("./meta"),
  defaults: {
    constraints: {
      width: { min: 340 },
      height: { min: 440 },
    },
  },
  props: z.object({
    daily: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  }),
  achievements: [
    { id: "first-solve", title: "Staked out", text: "Solve a puzzle." },
    { id: "daily", title: "Daily survey", text: "Solve a daily puzzle." },
    { id: "big", title: "Estate", text: "Solve a 9×9 puzzle without a hint." },
    { id: "solves-25", title: "Surveyor", text: "Solve 25 puzzles.", goal: 25 },
    { id: "quick", title: "Green thumb", text: "Solve a 6×6 puzzle in under 30 seconds without a hint.", secret: true },
  ],
  component: () => import("./plots.app.svelte"),
});
