import type { AppMeta } from "$lib/core/api";

export default {
  description: "World clock, alarms, timers and a stopwatch.",
  keywords: ["time", "clock", "alarm", "timer", "stopwatch", "countdown", "world clock", "time zone", "wake up"],
  pitch: {
    problem: "Alarms, timers and time zones each want their own app.",
    solution: "World clock, alarms, timers and a stopwatch in one window.",
  },
} satisfies AppMeta;
