import type { AppMeta } from "$lib/core/api";

export default {
  description: "Inspect the system services that run WebOS and their live state.",
  keywords: ["services", "system", "debug", "inspector", "internals", "registry"],
  pitch: {
    problem: "It's hard to see what the system is doing behind the windows.",
    solution: "Inspect every service that runs WebOS and its live state.",
  },
} satisfies AppMeta;
