import type { AppMeta } from "$lib/core/api";

export default {
  description: "Count up from the last time something happened, and see how long each run lasted.",
  keywords: ["counter", "count up", "streak", "since", "habit", "quit", "sober", "timer", "days", "last time"],
  pitch: {
    problem: "It's hard to remember when you last did something.",
    solution: "Count up from the last time, and see how long each run lasted.",
  },
} satisfies AppMeta;
