import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { z } from "zod";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "sokoban",
  name: "Sokoban",
  icon: AppIcon,
  category: AppCategory.GAMES,
  meta: () => import("./meta"),
  defaults: {
    constraints: {
      width: { min: 320 },
      height: { min: 400 },
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
    { id: "first-solve", title: "Crate expectations", text: "Solve a level." },
    { id: "daily", title: "Daily delivery", text: "Solve a daily level." },
    { id: "hard", title: "Heavy lifting", text: "Solve a Hard level." },
    { id: "improved", title: "Tidier", text: "Solve a level again in fewer moves than your best." },
    { id: "solves-25", title: "Warehouse regular", text: "Solve 25 levels.", goal: 25 },
    { id: "quick", title: "Forklift", text: "Solve a Hard level in under two minutes.", secret: true },
  ],
  component: () => import("./sokoban.app.svelte"),
});
