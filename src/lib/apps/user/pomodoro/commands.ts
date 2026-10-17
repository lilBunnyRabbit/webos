import { z } from "zod";
import { define_command } from "$lib/core/api/services/shell/define";
import type { ShellContribution } from "$lib/core/api/services/shell/type";

const logic = () => import("./shell.svelte");

export default {
  values: {
    "focus-day": {
      columns: ["day", "sessions", "minutes"],
      text: (day) =>
        `${day.day}  ${String(day.sessions).padStart(2)} sessions  ${String(day.minutes).padStart(4)} min`,
      open: () => void logic().then((m) => m.open_app()),
    },
  },
  commands: [
    define_command({
      id: "pomo",
      description: "Open Pomodoro",
      run: async () => (await logic()).open_app(),
    }),
    define_command({
      id: "pomo start",
      description: "Start or resume the timer, optionally naming the task",
      args: z.object({ task: z.array(z.string()).default([]).describe("What you're focusing on") }),
      positional: ["task"],
      run: async (context) => (await logic()).start(context),
    }),
    define_command({
      id: "pomo pause",
      description: "Pause the running timer",
      run: async () => (await logic()).pause(),
    }),
    define_command({
      id: "pomo skip",
      description: "Skip to the next phase",
      run: async () => (await logic()).skip(),
    }),
    define_command({
      id: "pomo reset",
      description: "Reset the current phase",
      run: async () => (await logic()).reset(),
    }),
    define_command({
      id: "pomo status",
      description: "The phase, time left and when it ends",
      run: async () => (await logic()).status(),
    }),
    define_command({
      id: "pomo stats",
      description: "Focus sessions and minutes for the last 7 days",
      yields: "focus-day",
      async *run() {
        yield* (await logic()).stats();
      },
    }),
    define_command({
      id: "pomo pin",
      description: "Pin the timer to the desktop",
      run: async () => (await logic()).pin(),
    }),
  ],
} satisfies ShellContribution;
