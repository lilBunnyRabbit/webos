import type { AppMeta } from "$lib/core/api";

export default {
  description: "Fill the grid so every row and column holds each digit once and every sign is obeyed.",
  keywords: ["unequal", "inequality", "latin square", "sudoku", "puzzle", "logic", "numbers", "game", "brain"],
  pitch: {
    problem: "Sudoku gets familiar, and you want a fresh grid puzzle.",
    solution: "Fill the grid so each row and column holds each digit once and every sign holds.",
  },
} satisfies AppMeta;
