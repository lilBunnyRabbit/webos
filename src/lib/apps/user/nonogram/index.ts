import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { Checkerboard as CheckerboardIcon } from "phosphor-svelte";
import { z } from "zod";

export default define_app({
  id: "nonogram",
  name: "Nonogram",
  icon: CheckerboardIcon,
  version: "1.1.0",
  category: AppCategory.GAMES,
  description: "Fill the grid from the number clues to reveal a picture, in black and white or colour. Draw your own.",
  keywords: ["picross", "griddlers", "puzzle", "logic", "colour", "editor"],
  associations: [".nonogram"],
  props: z.object({
    path: z.string().optional(),
    daily: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }),
  defaults: {
    constraints: {
      width: { min: 340 },
      height: { min: 400 },
    },
  },
  component: () => import("./nonogram.app.svelte"),
});
