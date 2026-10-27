import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { z } from "zod";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "sun-and-moon",
  name: "Sun & Moon",
  icon: AppIcon,
  category: AppCategory.GAMES,
  meta: () => import("./meta"),
  defaults: {
    constraints: {
      width: { min: 340 },
      height: { min: 460 },
    },
  },
  props: z.object({
    daily: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  }),
  achievements: [
    { id: "first-solve", title: "First light", text: "Solve a puzzle." },
    { id: "daily", title: "Day and night", text: "Solve a daily puzzle." },
    { id: "big", title: "Long night", text: "Solve an 8×8 puzzle without a hint." },
    { id: "solves-25", title: "Astronomer", text: "Solve 25 puzzles.", goal: 25 },
    { id: "quick", title: "Solar flare", text: "Solve a 6×6 puzzle in under 45 seconds without a hint.", secret: true },
  ],
  component: () => import("./sun-and-moon.app.svelte"),
});
