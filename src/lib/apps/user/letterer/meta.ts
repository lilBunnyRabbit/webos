import type { AppMeta } from "$lib/core/api";

export default {
  description:
    "Guess the hidden word in six tries, on up to eight boards at once, against a word that dodges you, with equations or in a survival run.",
  keywords: [
    "wordle",
    "word",
    "words",
    "guess",
    "letters",
    "puzzle",
    "daily",
    "dordle",
    "quordle",
    "octordle",
    "absurdle",
    "nerdle",
    "survival",
    "game",
  ],
  pitch: {
    problem: "One word puzzle a day isn't enough.",
    solution: "Guess hidden words on up to eight boards at once, against a dodging word or in a survival run.",
  },
} satisfies AppMeta;
