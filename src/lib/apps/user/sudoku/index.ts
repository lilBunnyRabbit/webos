import { define_app } from "$lib/core/api";
import { AppCategory, DailyRank } from "$lib/core/api/services/apps/type";
import { z } from "zod";
import AppIcon from "./icon.svelte";
import { Size } from "./size";

export default define_app({
  id: "sudoku",
  name: "Sudoku",
  icon: AppIcon,
  category: AppCategory.GAMES,
  meta: () => import("./meta"),
  guide: () => import("./guide.md?raw"),
  defaults: {
    constraints: {
      width: { min: 340 },
      height: { min: 480 },
    },
  },
  props: z.object({
    daily: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    /** The size; with `daily`, which size's daily (ADR-050). */
    mode: z.enum(Size).optional(),
  }),
  daily_rank: {
    [Size.NINE]: DailyRank.TIME,
    [Size.SIX]: DailyRank.TIME,
  },
  achievements: [
    { id: "first-solve", title: "Solved", text: "Solve a puzzle." },
    { id: "daily", title: "Puzzle of the day", text: "Solve a daily puzzle." },
    { id: "hard", title: "No help needed", text: "Solve a Hard 9×9 puzzle without a hint." },
    { id: "expert", title: "Expert", text: "Solve an Expert 9×9 puzzle." },
    { id: "solves-50", title: "Grid regular", text: "Solve 50 puzzles.", goal: 50 },
    { id: "speedrun", title: "Speedrun", text: "Solve an Easy 9×9 puzzle in under 3 minutes without a hint.", secret: true },
  ],
  component: () => import("./sudoku.app.svelte"),
});
