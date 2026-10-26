import type { AppMeta } from "$lib/core/api";

export default {
  description: "WebOS's own documentation: a live map of its services, a timeline of its decisions and every app's internals.",
  keywords: ["documentation", "docs", "help", "reference", "adr", "decisions", "architecture", "services", "manual", "roadmap"],
  pitch: {
    problem: "How WebOS works is spread over a hundred and fifty markdown files.",
    solution: "Read them in one place, with the services, decisions, apps and storage drawn as maps.",
  },
} satisfies AppMeta;
