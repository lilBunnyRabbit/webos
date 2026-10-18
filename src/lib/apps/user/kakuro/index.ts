import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { z } from "zod";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "kakuro",
  name: "Kakuro",
  icon: AppIcon,
  version: "1.0.0",
  category: AppCategory.GAMES,
  description: "Fill the grid with digits so every run adds up to its clue, no digit twice.",
  pitch: {
    problem: "You like number puzzles with a bit more arithmetic.",
    solution: "Fill the grid so every run adds up to its clue, no digit twice.",
  },
  keywords: ["cross sums", "kakro", "number crossword", "puzzle", "logic", "sum", "numbers", "game", "brain"],
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
  component: () => import("./kakuro.app.svelte"),
});
