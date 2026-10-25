import type { AppMeta } from "$lib/core/api";

export default {
  description: "Put a scrambled gradient back in order by swapping tiles around the locked ones.",
  keywords: ["color", "colour", "gradient", "sort", "hue", "shade", "tiles", "swap", "perception", "daily", "game"],
  pitch: {
    problem: "Colour puzzles are either too easy or a wall of near-identical tiles.",
    solution: "A scrambled gradient with a few tiles locked in place: swap the rest until it flows again.",
  },
} satisfies AppMeta;
