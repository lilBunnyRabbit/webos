import type { AppMeta } from "$lib/core/api";

export default {
  description: "Clock in and out, see your hours per day, week and month, print a time sheet.",
  keywords: ["time", "tracker", "time tracking", "timesheet", "hours", "clock in", "work", "job", "overtime"],
  pitch: {
    problem: "Worked hours tracked on paper rarely add up at the end of the month.",
    solution: "Clock in and out, see hours per day, week and month, and print a time sheet.",
  },
} satisfies AppMeta;
