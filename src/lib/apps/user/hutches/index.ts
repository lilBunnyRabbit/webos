import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { z } from "zod";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "hutches",
  name: "Hutches",
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
    { id: "first-solve", title: "Settled in", text: "Solve a puzzle." },
    { id: "daily", title: "Daily headcount", text: "Solve a daily puzzle." },
    { id: "big", title: "Full house", text: "Solve a 10×10 puzzle." },
    { id: "solves-25", title: "Landlord", text: "Solve 25 puzzles.", goal: 25 },
    { id: "by-hand", title: "By hand", text: "Solve a 10×10 puzzle without a hint, with auto-cross off.", secret: true },
  ],
  component: () => import("./hutches.app.svelte"),
});
