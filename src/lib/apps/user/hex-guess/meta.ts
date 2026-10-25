import type { AppMeta } from "$lib/core/api";

export default {
  description: "Name a colour's hex code in five tries, with higher and lower hints for every digit.",
  keywords: ["color", "colour", "hex", "code", "css", "rgb", "guess", "digits", "web", "daily", "game"],
  pitch: {
    problem: "You write hex codes every day and still can't read one at a glance.",
    solution: "See a colour, guess its hex code, and close in with a higher or lower hint per digit.",
  },
} satisfies AppMeta;
