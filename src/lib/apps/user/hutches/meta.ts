import type { AppMeta } from "$lib/core/api";

export default {
  description: "Place one rabbit per meadow, row and column, and never let two rabbits touch, not even at a corner.",
  keywords: ["queens", "star battle", "rabbits", "regions", "meadows", "daily", "puzzle", "logic", "game", "brain"],
  pitch: {
    problem: "You want a quick daily logic puzzle with no numbers in it.",
    solution: "One rabbit per meadow, row and column, and no two rabbits touching.",
  },
} satisfies AppMeta;
