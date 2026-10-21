import type { AppMeta } from "$lib/core/api";
import { OWNER } from "$lib/core/api/services/apps/authors";

export default {
  description: "Draw one path that hops through the numbers in order and fills every cell of the grid.",
  keywords: ["zip", "path", "numberlink", "hamiltonian", "rabbit", "hop", "daily", "puzzle", "logic", "game", "brain"],
  pitch: {
    problem: "You want a daily puzzle you can finish in a minute, drawn with one finger.",
    solution: "One path through the numbers in order that fills every cell, and a fresh one every day.",
  },
  authors: [OWNER],
} satisfies AppMeta;
