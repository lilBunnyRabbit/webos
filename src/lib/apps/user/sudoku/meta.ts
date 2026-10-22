import type { AppMeta } from "$lib/core/api";

export default {
  description: "Fill the grid so every row, column and box holds each digit once, on the classic 9×9 or a quick 6×6.",
  keywords: ["number", "numbers", "puzzle", "logic", "9x9", "6x6", "mini", "game", "brain", "classic"],
  pitch: {
    problem: "You want the classic number puzzle without a newspaper.",
    solution: "Fill the grid so every row, column and box holds each digit once, 9×9 or a quick 6×6.",
  },
} satisfies AppMeta;
