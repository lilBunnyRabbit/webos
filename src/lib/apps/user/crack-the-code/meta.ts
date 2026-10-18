import type { AppMeta } from "$lib/core/api";

export default {
  description: "Break a secret code of distinct digits. Each guess only tells you how many sit in the right place.",
  keywords: ["code", "cipher", "mastermind", "bulls and cows", "digits", "guess", "logic", "puzzle", "daily", "game"],
  pitch: {
    problem: "You want a logic puzzle you can finish over a coffee.",
    solution: "Break a secret code of distinct digits, told only how many sit in the right place.",
  },
} satisfies AppMeta;
