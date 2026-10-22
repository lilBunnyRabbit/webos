import type { AppMeta } from "$lib/core/api";
import { OWNER } from "$lib/core/api/services/apps/authors";

export default {
  description: "Split the garden into rectangular plots with one clue in each: the number is the plot's size, the icon its shape.",
  keywords: ["patches", "shikaku", "rectangles", "garden", "plots", "daily", "puzzle", "logic", "game", "brain"],
  pitch: {
    problem: "You want a quick daily logic puzzle you solve by drawing.",
    solution: "Drag rectangles across the garden until every cell sits in a plot whose one clue it fits.",
  },
  authors: [OWNER],
} satisfies AppMeta;
