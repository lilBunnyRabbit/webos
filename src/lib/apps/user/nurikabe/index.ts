import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { z } from "zod";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "nurikabe",
  name: "Nurikabe",
  icon: AppIcon,
  category: AppCategory.GAMES,
  meta: () => import("./meta"),
  defaults: {
    constraints: {
      width: { min: 340 },
      height: { min: 420 },
    },
  },
  props: z.object({
    daily: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  }),
  shell: () => import("./commands"),
  achievements: [
    { id: "first-solve", title: "Landfall", text: "Solve a puzzle." },
    { id: "daily", title: "Daily tide", text: "Solve a daily puzzle." },
    { id: "big", title: "Archipelago", text: "Solve a 12×12 puzzle without a hint." },
    { id: "solves-25", title: "Cartographer", text: "Solve 25 puzzles.", goal: 25 },
    { id: "quick", title: "Low tide", text: "Solve a 7×7 puzzle in under a minute without a hint.", secret: true },
  ],
  guide: () => import("./guide.md?raw"),
  component: () => import("./nurikabe.app.svelte"),
});
