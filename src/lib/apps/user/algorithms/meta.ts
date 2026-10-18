import type { AppMeta } from "$lib/core/api";

export default {
  description:
    "Watch classic algorithms work step by step: each step explained in plain words, the pseudocode line lit as it runs, live counters, and inputs you can type, randomise, pick from presets or draw.",
  keywords: [
    "algorithm",
    "algorithms",
    "data structures",
    "computer science",
    "cs",
    "learn",
    "visualize",
    "visualizer",
    "sorting",
    "sort",
    "bubble sort",
    "quick sort",
    "merge sort",
    "heap sort",
    "complexity",
    "big o",
    "pseudocode",
    "step by step",
  ],
  pitch: {
    problem: "Algorithms in textbooks are frozen pseudocode, so it's hard to see what actually happens at each step.",
    solution: "Run them on your own input and step through every comparison and change, explained in plain words with the pseudocode lit.",
  },
} satisfies AppMeta;
