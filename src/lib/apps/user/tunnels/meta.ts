import type { AppMeta } from "$lib/core/api";

export default {
  description: "Split a grid of letters into hidden words that wind through it, every letter used once.",
  keywords: ["wend", "word", "words", "letters", "path", "daily", "puzzle", "game", "linkedin"],
  pitch: {
    problem: "A word search only asks you to spot words in straight lines.",
    solution: "Trace winding words until every letter on the board belongs to one.",
  },
} satisfies AppMeta;
