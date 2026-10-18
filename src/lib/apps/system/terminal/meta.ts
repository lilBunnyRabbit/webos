import type { AppMeta } from "$lib/core/api";

export default {
  description: "Run commands over files, windows and apps, and pipe their results.",
  keywords: ["shell", "command", "console", "cli", "prompt", "bash", "command line"],
  pitch: {
    problem: "Clicking through windows is slow when you know exactly what you want.",
    solution: "Type commands over files, windows and apps, and pipe one result into the next.",
  },
} satisfies AppMeta;
