import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { Sigma as SigmaIcon } from "phosphor-svelte";
import { z } from "zod";

export default define_app({
  id: "kakuro",
  name: "Kakuro",
  icon: SigmaIcon,
  version: "1.0.0",
  category: AppCategory.GAMES,
  description: "Fill the grid with digits so every run adds up to its clue, no digit twice.",
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
