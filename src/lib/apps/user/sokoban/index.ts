import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { z } from "zod";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "sokoban",
  name: "Sokoban",
  icon: AppIcon,
  version: "1.0.0",
  category: AppCategory.GAMES,
  description: "Push every crate onto a goal without boxing yourself in.",
  pitch: {
    problem: "You want a puzzle where one wrong push ruins the plan.",
    solution: "Push every crate onto a goal without boxing yourself in.",
  },
  keywords: ["boxes", "crates", "warehouse", "push", "puzzle", "logic", "game", "classic"],
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
  component: () => import("./sokoban.app.svelte"),
});
