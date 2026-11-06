import type { AppMeta } from "$lib/core/api";
import { OWNER } from "$lib/core/api/services/apps/authors";

export default {
  description:
    "Paste a recipe from a website or fill in a simple form, keep recipes on shelves by tag, scale servings and cook step by step with timers.",
  keywords: [
    "recipe",
    "cooking",
    "cooklang",
    "cook",
    "kitchen",
    "ingredients",
    "servings",
    "food",
    "meal",
    "timer",
    "baking",
    "paste",
    "website",
    "favourites",
  ],
  pitch: {
    problem: "Recipes you like are scattered across websites and hard to follow while you cook.",
    solution: "Paste them in, keep them on shelves by tag, scale servings and cook step by step with timers.",
  },
  example: "paste a recipe from a website",
  authors: [{ name: "Steph" }, OWNER],
} satisfies AppMeta;
