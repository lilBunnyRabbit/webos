import type { AppMeta } from "$lib/core/api";

export default {
  description:
    "What's running and how hard it works: windows, widgets, frame rate, network, storage and background tasks.",
  keywords: [
    "task manager",
    "processes",
    "performance",
    "fps",
    "memory",
    "storage",
    "network",
    "profiler",
    "monitor",
    "widgets",
    "tasks",
    "background",
  ],
  pitch: {
    problem: "Something feels slow and you can't tell what's doing it.",
    solution: "See every window, widget, background task and the frame rate live, and close what's heavy.",
  },
} satisfies AppMeta;
