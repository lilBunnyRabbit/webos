import type { AppMeta } from "$lib/core/api";

export default {
  description: "Describe a word without saying the banned ones, and AI on this device tries to guess it.",
  keywords: ["taboo", "word", "guess", "clue", "describe", "party", "ai", "gemini", "nano", "game"],
  pitch: {
    problem: "Word games need a second player to guess.",
    solution: "Describe a word without its five banned words, and AI on your own device guesses it.",
  },
} satisfies AppMeta;
