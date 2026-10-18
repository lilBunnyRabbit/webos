import type { AppMeta } from "$lib/core/api";

export default {
  description: "Basic arithmetic with brackets, percent and a history of results.",
  keywords: ["math", "calc", "arithmetic", "numbers", "sum", "percent", "maths"],
  pitch: {
    problem: "You need a quick sum without reaching for your phone.",
    solution: "Type an expression with brackets and percent, and keep a history of results.",
  },
} satisfies AppMeta;
