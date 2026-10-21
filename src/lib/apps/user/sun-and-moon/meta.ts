import type { AppMeta } from "$lib/core/api";

export default {
  description: "Fill the grid with suns and moons: half of each in every row and column, never three alike in a row, every = and × obeyed.",
  keywords: ["tango", "takuzu", "binairo", "binary", "sun", "moon", "puzzle", "logic", "daily", "game", "brain"],
  pitch: {
    problem: "You want a quick logic puzzle with your morning coffee, not a long Sudoku.",
    solution: "A small grid of suns and moons with a few simple rules, and a fresh one every day.",
  },
} satisfies AppMeta;
