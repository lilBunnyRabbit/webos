import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { z } from "zod";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "word-search",
  name: "Word Search",
  icon: AppIcon,
  version: "1.0.0",
  category: AppCategory.GAMES,
  description: "Find the hidden words in a grid of letters.",
  keywords: ["wordsearch", "word find", "osmosmerka", "words", "puzzle", "letters", "game", "vocabulary"],
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
  component: () => import("./word-search.app.svelte"),
});
