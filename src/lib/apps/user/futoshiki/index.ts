import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { z } from "zod";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "futoshiki",
  name: "Futoshiki",
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
    { id: "first-solve", title: "Greater than zero", text: "Solve a puzzle." },
    { id: "daily", title: "Daily order", text: "Solve a daily puzzle." },
    { id: "big", title: "Seven up", text: "Solve a 7×7 puzzle without a hint." },
    { id: "solves-25", title: "In order", text: "Solve 25 puzzles.", goal: 25 },
    { id: "quick", title: "Snap judgement", text: "Solve a 5×5 puzzle in under a minute without a hint.", secret: true },
  ],
  component: () => import("./futoshiki.app.svelte"),
});
