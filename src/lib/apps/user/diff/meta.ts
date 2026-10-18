import type { AppMeta } from "$lib/core/api";

export default {
  description: "Compare two files or pasted texts side by side or inline.",
  keywords: ["compare", "difference", "diff", "merge", "changes", "text", "code", "versions"],
  pitch: {
    problem: "Spotting what changed between two versions by eye is error-prone.",
    solution: "Compare two files or pasted texts side by side or inline.",
  },
} satisfies AppMeta;
