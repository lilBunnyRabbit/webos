import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { z } from "zod";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "hop",
  name: "Hop",
  icon: AppIcon,
  category: AppCategory.GAMES,
  meta: () => import("./meta"),
  guide: () => import("./guide.md?raw"),
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
    { id: "first-solve", title: "First hop", text: "Solve a puzzle." },
    { id: "daily", title: "Daily hop", text: "Solve a daily puzzle." },
    { id: "big", title: "Long way round", text: "Solve an 8×8 puzzle without a hint." },
    { id: "solves-25", title: "Burrow mapper", text: "Solve 25 puzzles.", goal: 25 },
    { id: "quick", title: "Quick feet", text: "Solve a 7×7 puzzle in under 30 seconds without a hint.", secret: true },
  ],
  component: () => import("./hop.app.svelte"),
});
