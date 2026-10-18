import type { AppMeta } from "$lib/core/api";

export default {
  description: "A board for life: errands, projects and ideas, from later to done.",
  keywords: ["kanban", "board", "tasks", "todo", "cards", "planner"],
  pitch: {
    problem: "Errands and projects slip when they only live in your head.",
    solution: "Put them on a board and move each card from later to done.",
  },
} satisfies AppMeta;
