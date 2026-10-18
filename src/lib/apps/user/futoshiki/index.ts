import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { z } from "zod";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "futoshiki",
  name: "Futoshiki",
  icon: AppIcon,
  version: "1.0.0",
  category: AppCategory.GAMES,
  description: "Fill the grid so every row and column holds each digit once and every sign is obeyed.",
  pitch: {
    problem: "Sudoku gets familiar, and you want a fresh grid puzzle.",
    solution: "Fill the grid so each row and column holds each digit once and every sign holds.",
  },
  keywords: ["unequal", "inequality", "latin square", "sudoku", "puzzle", "logic", "numbers", "game", "brain"],
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
  component: () => import("./futoshiki.app.svelte"),
});
