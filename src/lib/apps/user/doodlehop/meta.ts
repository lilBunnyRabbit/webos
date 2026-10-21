import type { AppMeta } from "$lib/core/api";

export default {
  description: "Draw six words against the clock while on-device AI guesses what you drew.",
  keywords: ["draw", "drawing", "doodle", "sketch", "guess", "quick draw", "pictionary", "ai", "game"],
  pitch: {
    problem: "You want to know if your doodles read as what you meant.",
    solution: "Draw six words, twenty seconds each, while the AI on this device calls out what it sees.",
  },
} satisfies AppMeta;
