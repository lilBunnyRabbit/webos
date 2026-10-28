import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { z } from "zod";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "kakuro",
  name: "Kakuro",
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
    { id: "first-solve", title: "First sum", text: "Solve a puzzle." },
    { id: "daily", title: "Daily sums", text: "Solve a daily puzzle." },
    { id: "big", title: "Grand total", text: "Solve a 12×12 puzzle without a hint." },
    { id: "solves-25", title: "Accountant", text: "Solve 25 puzzles.", goal: 25 },
    { id: "quick", title: "Mental maths", text: "Solve a 6×6 puzzle in under a minute without a hint.", secret: true },
  ],
  component: () => import("./kakuro.app.svelte"),
});
